#!/usr/bin/env python3
"""Cuts the OCR banner region out of local clips so the read rate can be measured.

ffmpeg is not installed here; OpenCV from the sidecar's venv does the decoding:

    /home/administrator/iidxRandomAnalyzer/.venv/bin/python \
        scripts/layout-analysis/extract_ocr_banners.py

The crop matches ocrCrop() in src/features/layoutAnalysis/ocr.js exactly, so the
measurement sees what the browser would send to tesseract. The frames come from
other people's uploads and are not checked in.
"""
import hashlib
import json
import pathlib
import sys

import cv2

SIDECAR = pathlib.Path("/home/administrator/iidxRandomAnalyzer")
CLIPS = pathlib.Path.home() / ".cache" / "iidaran" / "clips"
TARGET = pathlib.Path(__file__).resolve().parents[2] / "test" / "fixtures" / "ocr-banners"
OFFSETS_SECONDS = (3, 8, 13)


def ocr_crop(width: int, height: int) -> tuple[int, int, int, int]:
    return round(width * 0.16), 0, round(width * 0.62), max(80, round(height * 0.2))


def reference_for(chart_url: str) -> dict:
    digest = hashlib.sha256(chart_url.encode()).hexdigest()
    path = SIDECAR / "tests" / "fixtures" / "auto-roi" / "references" / f"{digest}.json"
    return json.loads(path.read_text())["source"] if path.exists() else {}


def main() -> int:
    manifest = json.loads((SIDECAR / "tests" / "fixtures" / "auto-roi" / "manifest.json").read_text())
    TARGET.mkdir(parents=True, exist_ok=True)
    samples = []

    for clip in manifest["clips"]:
        video_id = clip["videoId"]
        if video_id.endswith("-middle"):
            continue
        source = CLIPS / f"{video_id}.mp4"
        if not source.exists():
            print(f"skip {video_id}: no local clip", file=sys.stderr)
            continue
        reference = reference_for(clip.get("chartUrl", ""))
        if not reference:
            print(f"skip {video_id}: no reference fixture, so no ground truth", file=sys.stderr)
            continue

        capture = cv2.VideoCapture(str(source))
        fps = capture.get(cv2.CAP_PROP_FPS) or 60.0
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        x, y, crop_width, crop_height = ocr_crop(width, height)
        for offset in OFFSETS_SECONDS:
            at = clip.get("startSeconds", 0) + offset
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(at * fps))
            ok, frame = capture.read()
            if not ok:
                print(f"skip {video_id}@{at}s: could not decode", file=sys.stderr)
                continue
            name = f"{video_id}-{at}s.png"
            cv2.imwrite(str(TARGET / name), frame[y:y + crop_height, x:x + crop_width])
            samples.append({
                "file": name,
                "videoId": video_id,
                "atSeconds": at,
                "frame": {"width": width, "height": height},
                "expectedTitle": reference.get("title"),
                "expectedDifficulty": reference.get("difficulty"),
                "textageChartKey": clip.get("textageChartKey"),
            })
        capture.release()
        print(f"{video_id}: {width}x{height}, crop {crop_width}x{crop_height}")

    (TARGET / "manifest.json").write_text(json.dumps({"samples": samples}, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(samples)} banners to {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
