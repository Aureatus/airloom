from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from app.gestures import GestureMachine
from app.protocol import FrameState, GestureEvent


def load_fixture(path: Path) -> list[FrameState]:
    payload = json.loads(path.read_text())
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict) and isinstance(payload.get("frames"), list):
        return payload["frames"]

    raise ValueError("Replay fixture must be a list or an object with a frames list")


def load_fixture_document(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if isinstance(payload, list):
        return {"meta": {}, "frames": payload}

    if isinstance(payload, dict) and isinstance(payload.get("frames"), list):
        return {"meta": payload.get("meta", {}), "frames": payload["frames"]}

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
