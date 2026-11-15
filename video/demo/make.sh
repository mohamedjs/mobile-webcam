#!/usr/bin/env bash
# End to end, from the project's video folder:  bash make.sh [--film]
#   TTS_PROVIDER=elevenlabs|gemini|openrouter   VOICE=<voice id or name>   WEB_OUT=../site/assets
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
[ "${1:-}" = "--film" ] && node tour.mjs tour.json

python3 tts.py lines.json vo/ --provider "${TTS_PROVIDER:-gemini}" ${VOICE:+--voice "$VOICE"}
python3 transcribe.py lines.json vo/ > vo/transcripts.txt || true    # read it: every take vs its script
python3 build.py storyboard.json vo/
python3 - <<'EOF'
import json, os
T = json.load(open('timing.json'))
for s in T['scenes']:
    if s.get('type') == 'shot': s['frames'] = len(os.listdir(f"clips/{s['clip']}"))
json.dump(T, open('timing.json', 'w'), ensure_ascii=False, indent=1)
EOF

curl -s -o /dev/null localhost:4180/stage.html || { python3 -m http.server 4180 > /dev/null 2>&1 & sleep 1; }
node preview.mjs                       # look at preview/*.jpg before the long render
node render.mjs
ffmpeg -y -loglevel error -framerate 30 -i out/%05d.jpg -i audio/mix.wav -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart explainer.mp4
if [ -n "${WEB_OUT:-}" ]; then   # small copy for a landing page (GitHub Pages: keep it well under 100 MB)
  ffmpeg -y -loglevel error -i explainer.mp4 -vf scale=1280:-2 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
    -c:a aac -b:a 96k -movflags +faststart "$WEB_OUT/explainer.mp4"
  ffmpeg -y -loglevel error -ss 2 -i explainer.mp4 -frames:v 1 -vf scale=1280:-2 "$WEB_OUT/video-poster.png"
fi
ffprobe -v error -show_entries format=duration -of csv=p=0 explainer.mp4
