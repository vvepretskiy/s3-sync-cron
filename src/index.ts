// Load .env before any other imports so env vars are available to config.ts
import * as dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import { config } from './config';
import { logger } from './logger';
import { runCopyJob } from './copyJob';
import { createStateStore } from './stateManager';
import { createStorageProvider } from './providers/storageProviderFactory';

const source = createStorageProvider(config.source);
const dest = createStorageProvider(config.dest);
const stateStore = createStateStore(config.state);

logger.info(
  {
    sourceType: config.source.type,
    destType: config.dest.type,
    stateType: config.state.type,
    cronSchedule: config.cronSchedule,
  },
  's3-sync-cron starting',
);

let inFlightJob: Promise<void> | null = null;
let isShuttingDown = false;

async function tick(): Promise<void> {
  if (isShuttingDown) {
    logger.info('Shutdown in progress — skipping tick');
    return;
  }

  logger.info('Cron tick — starting copy job');

  try {
    await runCopyJob(source, dest, stateStore);
  } catch (err: unknown) {
    logger.error({ err }, 'Copy job failed with unhandled error');
  }
}

const job = cron.schedule(
  config.cronSchedule,
  (_ctx) => {
    inFlightJob = tick().finally(() => {
      inFlightJob = null;
    });
  },
  {
    // Prevent a new tick from running if the previous one is still in-flight
    noOverlap: true,
  },
);

logger.info({ schedule: config.cronSchedule }, 'Cron job scheduled — waiting for first tick');

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Shutdown signal received — stopping gracefully');

  // Prevent any new cron ticks from being scheduled
  await job.stop();

  if (inFlightJob) {
    logger.info(
      { timeoutMs: config.shutdownTimeoutMs },
      'Waiting for in-flight job to complete',
    );

    const timeout = new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error('shutdown-timeout')),
        config.shutdownTimeoutMs,
      ),
    );

    try {
      await Promise.race([inFlightJob, timeout]);
      logger.info('In-flight job completed cleanly');
    } catch (err: unknown) {
      if ((err as Error).message === 'shutdown-timeout') {
        logger.warn(
          { timeoutMs: config.shutdownTimeoutMs },
          'In-flight job did not complete within timeout — forcing exit',
        );
      } else {
        logger.error({ err }, 'In-flight job error during shutdown');
      }
    }
  }

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
