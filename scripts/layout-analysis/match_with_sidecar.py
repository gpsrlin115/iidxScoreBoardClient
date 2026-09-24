#!/usr/bin/env python3
"""Puts the browser detector's events through the sidecar's matcher.

    /home/administrator/iidxRandomAnalyzer/.venv/bin/python \
        scripts/layout-analysis/match_with_sidecar.py [--observed DIR] [--json]

Run scripts/layout-analysis/run_worker_node.mjs first; it writes the events this
reads. Event counts on their own cannot say whether the client's evidence is
good enough, because the answer that matters is the recovered permutation. The
labels come from the sidecar's manifest, which took them from uploader
descriptions and on-screen options, never from a matcher.
"""
import argparse
import json
import pathlib
import sys
from hashlib import sha256

sys.path.insert(0, "/home/administrator/iidxRandomAnalyzer/src")

from iidaran.matching import LayoutMatcher
from iidaran.models import NoteEvent, ObservedNotes, PlayfieldGeometry, ReferenceChart

SIDECAR = pathlib.Path("/home/administrator/iidxRandomAnalyzer")
FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "test" / "fixtures" / "worker-clips"
AUTO_ROI = SIDECAR / "tests" / "fixtures" / "auto-roi"


def main() -> int:
    parser = argparse.ArgumentParser()
    # measure_frame_loss.mjs writes one folder per damaged variant of the clips.
    parser.add_argument("--observed", type=pathlib.Path, default=FIXTURES)
    parser.add_argument("--json", action="store_true", help="one JSON line per clip instead of prose")
    args = parser.parse_args()

    audit = {row["videoId"]: row for row in json.loads(
        (SIDECAR / "validation" / "real-clip-audit-2026-09-09.json").read_text())}
    labels = {clip["videoId"]: clip for clip in json.loads((AUTO_ROI / "manifest.json").read_text())["clips"]}

    observed_files = sorted(args.observed.glob("*.observed.json"))
    if not observed_files:
        print("no events; run scripts/layout-analysis/run_worker_node.mjs first", file=sys.stderr)
        return 1

    failures = 0
    for path in observed_files:
        wire = json.loads(path.read_text())
        video_id = wire["videoId"]
        geometry = audit[video_id]["geometry"]
        label = labels[video_id]

        observed = ObservedNotes(
            events=tuple(NoteEvent(e["timeMs"], e["lane"], e.get("kind", "tap")) for e in wire["events"]),
            fps=wire["fps"], frame_count=wire["frameCount"], duration_ms=wire["durationMs"],
            geometry=PlayfieldGeometry(
                geometry["x"], geometry["y"], geometry["width"], geometry["height"],
                geometry["judgementY"], wire.get("bandY", geometry["analysisY"]), "browser-auto-multi", 0.85,
                geometry["visibleTopY"], geometry["visibleBottomY"],
                (wire.get("bandY", geometry["analysisY"]),), (),
                tuple(geometry["laneCenters"]), tuple(geometry["laneWidths"])),
            detector_version="browser-worker-node-harness",
            lane_event_counts=tuple(wire["laneEventCounts"]))

        digest = sha256(label["chartUrl"].encode()).hexdigest()
        reference = ReferenceChart.from_cache_dict(json.loads((AUTO_ROI / "references" / f"{digest}.json").read_text()))
        result = LayoutMatcher().match(reference, observed)

        recovered = result.candidates[0].regular_to_played if result.candidates else None
        expected = label.get("expectedRegularToPlayed")
        ok = (result.status == "MATCHED" and result.side == label.get("expectedSide")
              and recovered == expected)
        failures += 0 if ok else 1
        if args.json:
            best = result.candidates[0] if result.candidates else None
            print(json.dumps({
                "videoId": video_id, "ok": ok, "status": result.status, "side": result.side,
                "expectedSide": label.get("expectedSide"), "recovered": recovered, "expected": expected,
                "score": round(best.match_score, 4) if best else None,
                "coverage": result.diagnostics.get("observationCoverage"),
                "laneCoverage": result.diagnostics.get("observedLaneCoverage"),
            }))
            continue
        if result.candidates:
            best = result.candidates[0]
            print(f"{video_id} {'ok  ' if ok else 'FAIL'} 밴드 y={wire.get('bandY')} status {result.status}"
                  f" side {result.side} (라벨 {label.get('expectedSide')})"
                  f" 배치 {recovered} (라벨 {expected})"
                  f" score {best.match_score:.4f} band {best.confidence_band}"
                  f" matched {best.matched_notes} 오차 {best.mean_timing_error_ms:.1f}ms")
        else:
            print(f"{video_id} FAIL status {result.status} 후보 없음")

    if not args.json:
        print(f"\n{len(observed_files) - failures}/{len(observed_files)} clips recovered the labelled layout")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
