from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

from app.gestures import GestureMachine
from app.protocol import FrameState, GestureEvent


def load_fixture(path: Path) -> list[FrameState]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, list):
        raise ValueError("Replay fixture must be a list of frame states")
    return payload


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
