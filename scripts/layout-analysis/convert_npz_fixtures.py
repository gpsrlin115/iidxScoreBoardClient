#!/usr/bin/env python3
"""Converts the sidecar's real-frame fixtures into flat binaries the browser tests can read.

The frames are stills from other people's uploads, so neither the sidecar's
npz files nor the output of this script is checked in. Rebuild them locally:

    /home/administrator/iidxRandomAnalyzer/.venv/bin/python \
        scripts/layout-analysis/convert_npz_fixtures.py

The sidecar rebuilds its own npz files from local clips with
scripts/extract_roi_frames.py --video-dir ~/.cache/iidaran/clips
"""
import json
import pathlib
import sys

import numpy as np

SOURCE = pathlib.Path("/home/administrator/iidxRandomAnalyzer/tests/fixtures/auto-roi")
TARGET = pathlib.Path(__file__).resolve().parents[2] / "test" / "fixtures" / "auto-roi"

# Expected values are the sidecar's, in its own fixture spaces: x and width in
# the 640-wide grayscale frame, the judgement line in the 1280x720 red mask.
CLIPS = [
    ("JTTV4NHuQsA", 470, 344),
    ("zqQygwU_8Q0", 25, 334),
    ("LewGJwC-AG4", 470, 384),
]


def main() -> int:
    missing = [clip for clip, _, _ in CLIPS if not (SOURCE / f"{clip}.frames.npz").exists()]
    if missing:
        print(f"sidecar fixtures missing: {', '.join(missing)}", file=sys.stderr)
        print("rebuild them with iidxRandomAnalyzer/scripts/extract_roi_frames.py", file=sys.stderr)
        return 1

    TARGET.mkdir(parents=True, exist_ok=True)
    meta = {"clips": []}
    for clip, expected_x, expected_judgement_y in CLIPS:
        data = np.load(SOURCE / f"{clip}.frames.npz")
        gray = np.ascontiguousarray(data["gray"], dtype=np.uint8)
        # The mask is one bit per pixel; stored as bytes it would be eight times
        # larger for no gain, and these are already 4.6M pixels per clip.
        red = np.packbits(np.ascontiguousarray(data["red_line"], dtype=bool), axis=-1)
        (TARGET / f"{clip}.gray.bin").write_bytes(gray.tobytes())
        (TARGET / f"{clip}.red.bin").write_bytes(red.tobytes())
        meta["clips"].append({
            "videoId": clip,
            "frames": int(gray.shape[0]),
            "gray": {"width": int(gray.shape[2]), "height": int(gray.shape[1])},
            "red": {"width": int(data["red_line"].shape[2]), "height": int(data["red_line"].shape[1])},
            "expectedX": expected_x,
            "expectedWidth": 145,
            "expectedJudgementY": expected_judgement_y,
        })
        print(f"{clip}: {gray.shape} gray, {data['red_line'].shape} red")

    (TARGET / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
