#!/usr/bin/env bash
# English Webcamo demo (Notebook look), from video/demo-en:   bash make.sh [snap|render]
#   Voice: ElevenLabs (key read by tts.py from ELEVENLABS_API_KEY or ~/.config/lura/keys.json; never written anywhere)
#   VOICE=<elevenlabs voice id>   VO=vo (folder with n1.wav … n11.wav)
#   Footage: the same clips as the Arabic video (../demo/clips, filmed by ../demo/tour.mjs); copy them into ./clips.
#   Sound: voice + a light whoosh on each cut (sfx/whoosh.wav). No music.
set -euo pipefail
cd "$(dirname "$0")"
VO="${VO:-vo}"
if [ ! -f "$VO/durations.json" ]; then
  python3 ../demo/tts.py lines.json "$VO/" --provider elevenlabs ${VOICE:+--voice "$VOICE"}
fi
python3 ../demo/build.py storyboard.json "$VO/"
python3 - <<'PY'
import json, os
T = json.load(open('timing.json'))
for s in T['scenes']:
    if s.get('type') == 'shot': s['frames'] = len(os.listdir(f"clips/{s['clip']}"))
    for it in s.get('items', []):          # a bullet card may wait for its own voice line
        if it.get('vo') in s.get('vo_at', {}): it['at'] = s['vo_at'][it['vo']]
json.dump(T, open('timing.json', 'w'), ensure_ascii=False, indent=1)
PY
DUR=$(python3 -c 'import json;print(json.load(open("timing.json"))["total"])')
W=(--page stage.html --out hf --size 1920x1080 --duration "$DUR" --audio audio/mix.wav --data timing.json=TIMING --fn render
   --copy fonts img clips remixicon.css remixicon.woff2)
case "${1:-snap}" in
  snap)   python3 hf_wrap.py "${W[@]}" --snapshot "${SNAP:-3,12,24,38,50,62,75,88,98}" ;;
  render) python3 hf_wrap.py "${W[@]}" --render webcamo-demo-en.mp4 --quality high ;;
esac
