# Webcamo demo video (narrated, real footage)

A 1920×1080, 30 fps product demo narrated in Egyptian Arabic, used on the
landing page (`site/assets/demo-ar.mp4`). The footage is the real desktop app,
dashboard and virtual camera, filmed with Playwright.

## Pieces

- `lines.json`: the narration, one line per scene. `VOICE_SCRIPT.md` is the
  same text as one take for Gemini TTS (voice Mako).
- `storyboard.json`: the scenes. `stage.html` draws them; `build.py` times
  them from the voice; `render.mjs` renders frames.
- `tour-app.json`: clips of the Electron app (`desktop/`). `tour-web.json`:
  the landing page and `call/`, a neutral video-call page that reads the
  virtual camera.
- `demo-phone/film-env.sh`: starts the daemon for filming with an isolated
  config folder. `real` uses the phone on the cable. `up [plugged]` uses
  `fakephone.mjs`, a stand-in that speaks the phone's wire protocol, with an
  `adb` shim, for filming without a phone.

## Make it

```bash
npm install
# voice: save the one take as vo/_source/take.wav, cut it into vo/n1.wav … vo/n11.wav
# at the long pauses, then:
python3 tts.py lines.json vo/ --clean-only
python3 build.py storyboard.json vo/            # prints each scene's length
python3 -m http.server 4181 &                   # for call/
node tour.mjs tour-app.json                     # connect, settings (phone on the cable)
node tour.mjs tour-web.json                     # install, meeting
# fill shot frame counts into timing.json (see make.sh), then:
python3 -m http.server 4180 &
node preview.mjs && node render.mjs
ffmpeg -framerate 30 -i out/%05d.jpg -i audio/mix.wav -c:v libx264 -crf 19 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart webcamo-demo-ar.mp4
```

Filming restores the phone's settings after each clip. If the phone is hot,
Webcamo lowers quality on its own and logs it; the clips used here had the
dashboard's event log painted out with the page background for that reason.
