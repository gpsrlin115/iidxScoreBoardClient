#!/usr/bin/env python3
"""Cuts the analysis band out of local clips so the browser event detector can be run on real video.

    /home/administrator/iidxRandomAnalyzer/.venv/bin/python \
        scripts/layout-analysis/extract_worker_frames.py

The band and the lane layout come from the sidecar's audited geometry, so a
difference in the events is a difference in the detector rather than in where it
was pointed. The frames are from other people's uploads and are not checked in.
"""
import json
import pathlib
import sys

import cv2
import numpy as np

SIDECAR = pathlib.Path("/home/administrator/iidxRandomAnalyzer")
CLIPS = pathlib.Path.home() / ".cache" / "iidaran" / "clips"
TARGET = pathlib.Path(__file__).resolve().parents[2] / "test" / "fixtures" / "worker-clips"
LABELLED = {"JTTV4NHuQsA", "wGbgc0vrxkY", "zqQygwU_8Q0", "agoYv4Vnsaw"}
SECONDS = 30.0


def main() -> int:
    audit = json.loads((SIDECAR / "validation" / "real-clip-audit-2026-09-09.json").read_text())
    manifest = json.loads((SIDECAR / "tests" / "fixtures" / "auto-roi" / "manifest.json").read_text())
    starts = {clip["videoId"]: clip.get("startSeconds", 0) for clip in manifest["clips"]}
    expected = {clip["videoId"]: clip for clip in manifest["clips"]}

    TARGET.mkdir(parents=True, exist_ok=True)
    entries = []
    for row in audit:
        video_id = row["videoId"]
        if video_id not in LABELLED:
            continue
        source = CLIPS / f"{video_id}.mp4"
        if not source.exists():
            print(f"skip {video_id}: no local clip", file=sys.stderr)
            continue

        geometry = row["geometry"]
        band_height = max(12, round(geometry["height"] * 0.035))
        top = geometry["analysisY"] - round(band_height / 2)
        capture = cv2.VideoCapture(str(source))
        fps = capture.get(cv2.CAP_PROP_FPS) or 60.0
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(starts.get(video_id, 0) * fps))

        frames = 0
        with (TARGET / f"{video_id}.band.bin").open("wb") as out:
            while frames < int(SECONDS * fps):
                ok, frame = capture.read()
                if not ok:
                    break
                band = frame[top:top + band_height, geometry["x"]:geometry["x"] + geometry["width"]]
                if band.shape[0] != band_height or band.shape[1] != geometry["width"]:
                    break
                # BGR to RGBA, which is what getImageData hands the detector.
                rgba = np.dstack([band[:, :, ::-1], np.full(band.shape[:2], 255, dtype=np.uint8)])
                out.write(np.ascontiguousarray(rgba).tobytes())
                frames += 1
        capture.release()

        entries.append({
            "videoId": video_id,
            "frames": frames,
            "fps": fps,
            "band": {"width": geometry["width"], "height": band_height},
            "laneCenters": geometry["laneCenters"],
            "laneWidths": geometry["laneWidths"],
            "durationMs": round(frames / fps * 1000),
            "expectedSide": row["side"],
            "expectedRegularToPlayed": expected[video_id].get("expectedRegularToPlayed"),
            "sidecarEvents": row["events"],
        })
        print(f"{video_id}: {frames} frames at {fps:.1f}fps, band {geometry['width']}x{band_height}")

    (TARGET / "manifest.json").write_text(json.dumps({"clips": entries}, indent=2) + "\n")
    print(f"wrote {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
