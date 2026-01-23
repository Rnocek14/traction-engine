# FFmpeg Microservice Specification

**Target Host**: Fly.io  
**Purpose**: Server-side video assembly with crossfade transitions and baked voiceover audio  
**Status**: Specification ready for implementation

---

## Overview

This microservice receives clip URLs, voiceover audio, and transition settings, then produces a single assembled MP4 with:
- Resolution/FPS normalization (mixed inputs → uniform output)
- Crossfade transitions between clips
- Voiceover audio baked as the master audio track
- Direct upload to Supabase Storage

---

## API Contract

### `POST /render/reel`

**Request Body:**

```json
{
  "job_id": "uuid",
  "clips": [
    { "url": "https://.../videos/clip1.mp4", "duration": 4.0 },
    { "url": "https://.../videos/clip2.mp4", "duration": 4.0 },
    { "url": "https://.../videos/clip3.mp4", "duration": 4.0 }
  ],
  "voiceover_url": "https://.../audio/voiceover.mp3",
  "output": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "video_bitrate": "8M",
    "audio_bitrate": "192k"
  },
  "transition": {
    "type": "fade",
    "duration": 0.2
  },
  "mix": {
    "duck_video_audio": true,
    "video_audio_gain_db": -18,
    "voiceover_gain_db": 0
  },
  "upload": {
    "provider": "supabase",
    "bucket": "videos",
    "path": "assembled/{job_id}.mp4",
    "upsert": true,
    "supabase_url": "https://xxx.supabase.co",
    "supabase_service_key": "service_role_key"
  },
  "idempotency_key": "script_run_id:v3"
}
```

**Response (Sync):**

```json
{
  "job_id": "uuid",
  "status": "succeeded",
  "output_url": "https://.../storage/v1/object/public/videos/assembled/uuid.mp4",
  "duration": 11.4,
  "meta": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "transition_duration": 0.2
  }
}
```

**Response (Async - if processing takes too long):**

```json
{
  "job_id": "uuid",
  "status": "queued",
  "eta_seconds": 45
}
```

### `GET /render/reel/{job_id}`

Poll for job status:

```json
{
  "job_id": "uuid",
  "status": "succeeded",
  "output_url": "https://.../videos/assembled/uuid.mp4",
  "duration": 11.4
}
```

---

## FFmpeg Pipeline

### 1. Video Normalization (per clip)

Each input clip is normalized to the target resolution with letterboxing:

```
scale=1080:1920:force_original_aspect_ratio=decrease,
pad=1080:1920:(ow-iw)/2:(oh-ih)/2,
fps=30,
setsar=1,
format=yuv420p
```

### 2. Crossfade Chain

For N clips with transition duration `t`:

**Offset calculation:**
- offset_1 = d1 - t
- offset_2 = (d1 + d2) - 2t
- offset_k = sum(d_1..d_k) - k*t

**Example (3 clips, 4s each, 0.2s transition):**

```bash
ffmpeg -i clip1.mp4 -i clip2.mp4 -i clip3.mp4 -i voiceover.mp3 \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p[v0];
    [1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p[v1];
    [2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p[v2];
    
    [v0][v1]xfade=transition=fade:duration=0.2:offset=3.8[v01];
    [v01][v2]xfade=transition=fade:duration=0.2:offset=7.6[v];
    
    [3:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=0:11.4,asetpts=N/SR/TB[vo]
  " \
  -map "[v]" -map "[vo]" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -r 30 -b:v 8M \
  -c:a aac -b:a 192k -ar 48000 \
  -shortest \
  output.mp4
```

### 3. Audio Strategy (v1)

- **Voiceover is master**: Clip audio is ignored
- **atrim**: Ensures audio matches expected video duration
- **-shortest**: Prevents trailing silence

### 4. Upload to Supabase

```javascript
const response = await fetch(
  `${supabase_url}/storage/v1/object/${bucket}/${path}`,
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${supabase_service_key}`,
      'Content-Type': 'video/mp4',
      'x-upsert': 'true'
    },
    body: videoBuffer
  }
);
```

---

## Implementation Notes

### Fly.io Dockerfile

```dockerfile
FROM node:20-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
```

### Key Considerations

1. **Timeout**: Fly.io has 60s default HTTP timeout. For longer renders, return 202 + job_id and poll.

2. **Memory**: Video processing needs RAM. Use `fly scale memory 2048` for 1080p renders.

3. **Temp storage**: Use `/tmp` for intermediate files, clean up after render.

4. **Idempotency**: Check `idempotency_key` before starting. Return cached result if exists.

5. **Error handling**: On FFmpeg failure, return detailed error with clip that failed.

---

## Security

- **Auth**: Require service-to-service token or shared secret
- **Input validation**: Validate all URLs are from expected domains
- **Rate limiting**: Limit concurrent renders per project
- **Cleanup**: Delete temp files immediately after upload

---

## Future Enhancements (v2+)

- [ ] Captions overlay (burned-in SRT)
- [ ] Watermark positioning
- [ ] Blur-fill background (instead of black letterbox)
- [ ] Additional transition types (wipe, push, zoom)
- [ ] Loudness normalization (-16 LUFS)
- [ ] Webhook callback on completion
