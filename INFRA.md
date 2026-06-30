# s3-sync-cron — Infrastructure & Operations Guide

## Overview

`s3-sync-cron` is a Node.js/TypeScript service that runs as a Docker container.
Every **5 minutes** (configurable) it:

1. Reads a persisted state file from S3 to get the `lastRunTimestamp`.
2. Lists all objects under `SOURCE_BUCKET/SOURCE_PREFIX`.
3. Copies every object whose `LastModified > lastRunTimestamp` to `DEST_BUCKET/DEST_PREFIX` with SSE-S3 encryption.
4. Writes an updated state file back to S3.

State is persisted in S3 so the service is **stateless** — any container restart or re-deployment automatically continues from where the previous run left off.

---

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Node.js | 20 LTS |
| Docker | 24+ |
| AWS CLI | 2.x (for bucket setup) |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_REGION` | ✅ | — | AWS region for all S3 operations |
| `AWS_ACCESS_KEY_ID` | ✅ | — | IAM access key (use IAM role in production) |
| `AWS_SECRET_ACCESS_KEY` | ✅ | — | IAM secret key (use IAM role in production) |
| `SOURCE_BUCKET` | ✅ | — | S3 bucket to read files from |
| `SOURCE_PREFIX` | | `""` | Key prefix (folder) within the source bucket |
| `DEST_BUCKET` | ✅ | — | S3 bucket to copy files to |
| `DEST_PREFIX` | | `""` | Key prefix (folder) within the destination bucket |
| `STATE_BUCKET` | ✅ | — | S3 bucket used to store the state JSON file |
| `STATE_KEY` | | `s3-sync-cron/state.json` | S3 key for the state file |
| `CRON_SCHEDULE` | | `*/5 * * * *` | cron expression for the sync interval |
| `LOG_LEVEL` | | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `SHUTDOWN_TIMEOUT_MS` | | `10000` | Max ms to wait for in-flight job on SIGTERM |

Copy `.env.example` to `.env` and fill in the values before local development.

---

## IAM Policy

Attach the following least-privilege policy to the IAM user or role running this service.
Replace the placeholder ARNs with your actual bucket names.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListSourceBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR-SOURCE-BUCKET"
    },
    {
      "Sid": "ReadSourceObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR-SOURCE-BUCKET/*"
    },
    {
      "Sid": "WriteDestObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR-DEST-BUCKET/*"
    },
    {
      "Sid": "ReadWriteStateFile",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR-STATE-BUCKET/s3-sync-cron/state.json"
    }
  ]
}
```

> **Note:** `s3:DeleteObject` is intentionally omitted. This service never deletes objects.

---

## Build & Run

### Local development

```bash
# Install dependencies
npm ci

# Run with hot-reload (requires .env)
npm run dev

# Type-check only
npm run typecheck

# Audit for known vulnerabilities
npm audit
```

### Docker

```bash
# Build image
docker build -t s3-sync-cron .

# Run with env file (hardened flags)
docker run \
  --env-file .env \
  --cap-drop ALL \
  --read-only \
  --tmpfs /tmp \
  --name s3-sync-cron \
  s3-sync-cron
```

> **Security notes:**
> - `--cap-drop ALL` — drops all Linux capabilities.
> - `--read-only` — mounts the container root filesystem read-only.
> - `--tmpfs /tmp` — provides a writable tmpfs for Node.js temp files.
> - Never use `--env` for credential values in production; prefer IAM roles or secrets managers.

---

## Deployment

### AWS ECS (Fargate)

1. Push the image to ECR:
   ```bash
   aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker tag s3-sync-cron <account>.dkr.ecr.<region>.amazonaws.com/s3-sync-cron:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/s3-sync-cron:latest
   ```
2. Create an ECS task definition with the environment variables above.
3. Attach an **ECS task role** with the IAM policy above — no long-lived keys needed.
4. Run as a long-running ECS service (the cron runs inside the container).

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: s3-sync-cron
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: s3-sync-cron
              image: <your-registry>/s3-sync-cron:latest
              envFrom:
                - secretRef:
                    name: s3-sync-cron-secrets
              securityContext:
                runAsNonRoot: true
                runAsUser: 1001
                readOnlyRootFilesystem: true
                allowPrivilegeEscalation: false
                capabilities:
                  drop: ["ALL"]
```

> When running in K8s, set `CRON_SCHEDULE=* * * * *` (every minute, or any value)
> if you prefer Kubernetes to own the schedule rather than `node-cron`.

---

## State File

The state file is a small JSON document stored at `STATE_BUCKET/STATE_KEY`:

```json
{
  "lastRunTimestamp": "2026-06-30T12:00:00.000Z",
  "filesProcessed": 42,
  "lastRunDurationMs": 3210,
  "lastRunAt": "2026-06-30T12:00:00.000Z"
}
```

- On first run (no state file), `lastRunTimestamp` defaults to the Unix epoch — **all existing objects** in the source prefix will be copied.
- Enable **S3 Versioning** on the state bucket to retain a history of past runs.

---

## Monitoring & Logging

- Logs are emitted to **stdout** in JSON format (pino).
- In ECS, logs are automatically shipped to **CloudWatch Logs** via the `awslogs` log driver.
- Recommended CloudWatch Logs Insights query to detect failures:

```
fields @timestamp, @message
| filter level = "error" or level = "fatal"
| sort @timestamp desc
| limit 50
```

- Set a CloudWatch Alarm on `ERROR`/`FATAL` log events for alerting.

---

## Security Considerations

| Control | Implementation |
|---|---|
| Credential handling | Env vars only; never logged (pino redacts them); not baked into Docker image |
| IAM least privilege | Per-bucket, per-action; no wildcards; no `s3:DeleteObject` |
| Encryption in transit | HTTPS enforced by AWS SDK v3 |
| Encryption at rest | SSE-S3 (`AES256`) applied to all `PutObject` / `CopyObject` calls |
| Input validation | S3 key names validated (regex + `../` rejection) before use |
| Container hardening | Non-root UID 1001; `--cap-drop ALL`; read-only filesystem |
| Dependency security | `package-lock.json` committed; run `npm audit` regularly |

### Optional: SSE-KMS

To use a Customer Managed Key (CMK) instead of SSE-S3, replace `ServerSideEncryption: 'AES256'` with:

```typescript
ServerSideEncryption: 'aws:kms',
SSEKMSKeyId: 'arn:aws:kms:<region>:<account>:key/<key-id>',
```

Add `kms:GenerateDataKey` and `kms:Decrypt` to the IAM policy for the key.
