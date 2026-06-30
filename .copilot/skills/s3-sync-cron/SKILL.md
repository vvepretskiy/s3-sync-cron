---
name: s3-sync-cron
description: >
  TypeScript/Node.js Docker service that runs a cron job every 5 minutes
  (configurable) and copies files from one AWS S3 bucket to another.
  Only objects whose LastModified timestamp is newer than the last recorded
  run time are copied. State (last-run timestamp) is persisted as a JSON
  file in S3 so the service is stateless and survives container restarts.
applyTo: "**"
---

# s3-sync-cron — Agent Skill

## What this service does

- **Schedule:** cron via `node-cron`, default `*/5 * * * *` (configurable via `CRON_SCHEDULE`)
- **Copy logic:** `ListObjectsV2` (paginated) → filter `obj.LastModified > state.lastRunTimestamp` → `CopyObjectCommand` with SSE-S3
- **State persistence:** small JSON file at `STATE_BUCKET/STATE_KEY` (S3); read at tick start, written at tick end
- **Graceful shutdown:** `SIGTERM`/`SIGINT` → stop cron → await in-flight job (timeout: `SHUTDOWN_TIMEOUT_MS`) → exit 0

## Source layout

```
src/
  index.ts         — entry point: dotenv, cron schedule, signal handlers
  config.ts        — Zod schema validates all env vars; only access point for process.env
  logger.ts        — pino logger; redacts awsAccessKeyId / awsSecretAccessKey
  types.ts         — SyncState, CopyResult interfaces
  s3Client.ts      — S3Client singleton (maxAttempts: 3)
  stateManager.ts  — readState() / writeState() — S3 JSON state file
  copyJob.ts       — runCopyJob(): list → filter → copy → write state
```

## Key env vars

| Variable | Purpose |
|---|---|
| `AWS_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credentials (use IAM role in prod) |
| `SOURCE_BUCKET` / `SOURCE_PREFIX` | Source S3 location |
| `DEST_BUCKET` / `DEST_PREFIX` | Destination S3 location |
| `STATE_BUCKET` / `STATE_KEY` | State file S3 location |
| `CRON_SCHEDULE` | cron expression (default `*/5 * * * *`) |
| `LOG_LEVEL` | pino log level (default `info`) |
| `SHUTDOWN_TIMEOUT_MS` | Max wait for in-flight job on shutdown (default `10000`) |

## Security controls built in

- Credentials never logged (pino `redact` config)
- All env vars validated by Zod before use — no raw `process.env` outside `config.ts`
- S3 key names validated with regex + `../` rejection before `CopyObjectCommand`
- SSE-S3 (`AES256`) on all `PutObject` / `CopyObject` calls
- Non-root container user (UID 1001), run with `--cap-drop ALL --read-only`
- IAM least-privilege: no `s3:DeleteObject`, no wildcards

## Error behaviour

| Error | Behaviour |
|---|---|
| `NoSuchKey` on state file | Use default state (epoch), copy all files |
| `AccessDenied` on a single file | Skip + log warning, continue |
| `NoSuchBucket` on source | `logger.fatal` + `process.exit(1)` |
| SDK throttling (`SlowDown`) | SDK v3 exponential backoff (maxAttempts: 3) |
| Unhandled rejection | `logger.fatal` + `process.exit(1)` |

## Build & run

```bash
npm ci && npm run build          # compile
docker build -t s3-sync-cron .  # build image
docker run --env-file .env --cap-drop ALL --read-only --tmpfs /tmp s3-sync-cron
```

See `INFRA.md` for full IAM policy, ECS/K8s deployment, and monitoring guidance.
