from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any, cast

from app.gestures import GestureMachine
from app.protocol import FrameState, GestureEvent, PoseName, empty_pose_scores, pose_scores_for_pose


def _normalize_pose_scores(raw_scores: dict[str, Any] | None) -> dict[str, float]:
    scores = empty_pose_scores()
    if raw_scores is None:
        return scores

    for key, value in raw_scores.items():
        if key in scores:
            scores[key] = float(value)
    return scores


def infer_legacy_pose(frame: dict[str, Any]) -> tuple[PoseName, float]:
    if not frame.get("tracking", False):
        return "unknown", 0.0

    if frame.get("closed_fist", False):
        return "closed-fist", 0.85

    if frame.get("open_palm_hold", False):
        return "open-palm", 0.85

    secondary = float(frame.get("secondary_pinch_strength", 0.0))
    primary = float(frame.get("pinch_strength", 0.0))
    if secondary >= 0.8:
        return "secondary-pinch", secondary
    if primary >= 0.78:
        return "primary-pinch", primary

    return "neutral", 0.65


def normalize_fixture_frame(frame: dict[str, Any]) -> FrameState:
    if isinstance(frame.get("rulePose"), str):
        normalized_frame = {
            "tracking": bool(frame.get("tracking", True)),
            "pose": frame.get("rulePose", "unknown"),
            "pose_confidence": float(frame.get("ruleConfidence", 0.0)),
            "pose_scores": _normalize_pose_scores(
                cast(dict[str, Any] | None, frame.get("ruleScores"))
            )
            if isinstance(frame.get("ruleScores"), dict)
            else pose_scores_for_pose(cast(PoseName, frame.get("rulePose", "unknown")), 0.0),
            "pinch_strength": float(frame.get("features", {}).get("primary_pinch_strength", 0.0)),
            "secondary_pinch_strength": float(
                frame.get("features", {}).get("secondary_pinch_strength", 0.0)
            ),
            "open_palm_hold": frame.get("rulePose") == "open-palm",
            "closed_fist": frame.get("rulePose") == "closed-fist",
            "confidence": 0.9,
            "brightness": float(frame.get("brightness", 0.0)),
            "hand_landmarks": frame.get("landmarks", []),
            "feature_values": frame.get("features", {}),
            "delay_ms": int(frame.get("delay_ms", 0)),
        }
        return cast(FrameState, normalized_frame)

    pose = frame.get("pose")
    pose_confidence = frame.get("pose_confidence")
    if not isinstance(pose, str) or not isinstance(pose_confidence, (int, float)):
        inferred_pose, inferred_confidence = infer_legacy_pose(frame)
        normalized_frame = {
            **frame,
            "pose": inferred_pose,
            "pose_confidence": inferred_confidence,
            "pose_scores": pose_scores_for_pose(inferred_pose, inferred_confidence),
        }
        return cast(FrameState, normalized_frame)

    if not isinstance(frame.get("pose_scores"), dict):
        normalized_frame = {
            **frame,
            "pose_scores": pose_scores_for_pose(cast(PoseName, pose), float(pose_confidence)),
        }
        return cast(FrameState, normalized_frame)

    normalized_frame = {
        **frame,
        "pose_scores": _normalize_pose_scores(cast(dict[str, Any], frame.get("pose_scores", {}))),
    }
    return cast(FrameState, normalized_frame)


def load_fixture(path: Path) -> list[FrameState]:
    payload = json.loads(path.read_text())
    if isinstance(payload, list):
        return [normalize_fixture_frame(frame) for frame in payload]

    if isinstance(payload, dict) and isinstance(payload.get("frames"), list):
        return [normalize_fixture_frame(frame) for frame in payload["frames"]]

    raise ValueError("Replay fixture must be a list or an object with a frames list")


def load_fixture_document(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if isinstance(payload, list):
        return {"meta": {}, "frames": [normalize_fixture_frame(frame) for frame in payload]}

    if isinstance(payload, dict) and isinstance(payload.get("frames"), list):
        return {
            "meta": payload.get("meta", {}),
            "frames": [normalize_fixture_frame(frame) for frame in payload["frames"]],
        }

    raise ValueError("Replay fixture must be a list or an object with a frames list")


def run_replay(frames: Iterable[FrameState]) -> list[GestureEvent]:
    machine = GestureMachine()
    events: list[GestureEvent] = []
    for frame in frames:
        events.extend(machine.update(frame))
    return events


def iter_replay(frames: Iterable[FrameState]) -> Iterable[tuple[FrameState, list[GestureEvent]]]:
    machine = GestureMachine()
    for frame in frames:
        yield frame, machine.update(frame)
