from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from app.camera import Camera
from app.gestures import GestureMachine
from app.hand_tracking import HandTracker
from app.replay import load_fixture, run_replay


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Airloom vision service")
    parser.add_argument("--stdio", action="store_true", help="emit events as JSON lines to stdout")
    parser.add_argument("--fixture", type=Path, help="replay a landmark/frame-state fixture")
    parser.add_argument(
        "--max-frames", type=int, default=0, help="cap live processing frames for testing"
    )
    return parser.parse_args()


def emit(event: object) -> None:
    print(json.dumps(event), flush=True)


def run_fixture(path: Path) -> None:
    frames = load_fixture(path)
    for event in run_replay(frames):
        emit(event)


def run_live(max_frames: int) -> None:
    tracker = HandTracker()
    machine = GestureMachine()
    processed = 0

    with Camera() as camera:
        while True:
            frame = camera.read()
            frame_state = tracker.process(frame)
            for event in machine.update(frame_state):
                emit(event)
            processed += 1
            if max_frames and processed >= max_frames:
                return
            time.sleep(1 / 30)


def main() -> None:
    args = parse_args()
    if args.fixture is not None:
        run_fixture(args.fixture)
        return

    run_live(args.max_frames)


if __name__ == "__main__":
    main()
