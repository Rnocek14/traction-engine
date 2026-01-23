# FFmpeg Assembly Microservice

Server-side video assembly with crossfade transitions and baked voiceover audio.

## Deployment

This service deploys automatically to Fly.io via GitHub Actions when changes are pushed to `main`.

### Prerequisites

1. **Create a Fly.io account** at [fly.io](https://fly.io)

2. **Get your Fly API token**:
   - Go to [fly.io/user/personal_access_tokens](https://fly.io/user/personal_access_tokens)
   - Create a new token

3. **Add GitHub secret**:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add new secret: `FLY_API_TOKEN` = your Fly token

4. **Add Supabase secret** (after first deploy):
   - Go to Supabase Dashboard → Project Settings → Functions → Secrets
   - Add: `FFMPEG_SERVICE_URL` = `https://life-path-ffmpeg-service.fly.dev`

### Manual Deployment (optional)

```bash
cd ffmpeg-service
fly auth login
fly launch --name life-path-ffmpeg-service
fly secrets set ALLOWED_HOSTNAMES="jrujlpljluvxewjytuab.supabase.co"
fly deploy
```

## API Endpoints

### `POST /render/reel`
Start a render job. Returns 202 with job_id.

### `GET /jobs/:job_id`
Poll job status (queued → rendering → succeeded/failed).

### `GET /health`
Health check endpoint.

## Local Development

```bash
npm install
npm run dev
```

Requires FFmpeg installed locally.
