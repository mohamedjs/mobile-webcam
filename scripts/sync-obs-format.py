#!/usr/bin/env python3
"""Make OBS output exactly what the phone is capturing.

Meet sees OBS's canvas, not the phone's stream, so a hard-coded OBS resolution
silently downscales whatever you picked in the app: choose 1080p60 and the call
still gets 720p24. This reads the phone's effective settings and writes them
into the OBS profile.

Run before launching OBS; mac-camera.sh does this automatically.
"""
import json
import os
import re
import sys
import urllib.request

PHONE = "http://127.0.0.1:8080/settings"
PROFILES = os.path.expanduser("~/Library/Application Support/obs-studio/basic/profiles")


def phone_settings():
    with urllib.request.urlopen(PHONE, timeout=4) as r:
        return json.load(r)


def profile_paths():
    if not os.path.isdir(PROFILES):
        return []
    return [
        os.path.join(PROFILES, name, "basic.ini")
        for name in os.listdir(PROFILES)
        if os.path.isfile(os.path.join(PROFILES, name, "basic.ini"))
    ]


def apply(path, width, height, fps):
    s = open(path).read()

    # Base and output are both set to the capture size: any difference makes OBS
    # rescale every frame for no benefit.
    pairs = {
        "BaseCX": width, "BaseCY": height,
        "OutputCX": width, "OutputCY": height,
        "FPSCommon": fps, "FPSInt": fps, "FPSNum": fps,
    }
    for key, value in pairs.items():
        if re.search(rf"^{key}=", s, re.M):
            s = re.sub(rf"^{key}=.*$", f"{key}={value}", s, flags=re.M)
        elif "[Video]" in s:
            s = s.replace("[Video]", f"[Video]\n{key}={value}", 1)

    if "FPSDen=" not in s and "[Video]" in s:
        s = s.replace("[Video]", "[Video]\nFPSDen=1", 1)

    open(path, "w").write(s)


def main():
    try:
        settings = phone_settings()
    except Exception as exc:
        print(f"phone not reachable ({exc}); leaving OBS settings alone")
        return 0

    width = int(settings["resolution"]["width"])
    height = int(settings["resolution"]["height"])
    fps = int(settings["fps"])

    paths = profile_paths()
    if not paths:
        print("no OBS profile found")
        return 1

    for path in paths:
        apply(path, width, height, fps)

    print(f"OBS set to {width}x{height} @ {fps}fps (from the phone)")
    print("Restart OBS if it is already running — it reads this at launch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
