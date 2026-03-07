from __future__ import annotations

from time import sleep

import numpy as np
import pytest

from app.camera import Camera


class _ScriptedCapture:
    def __init__(
        self, responses: list[tuple[bool, object | None, float]], opened: bool = True
    ) -> None:
        self._responses = responses
        self._index = 0
        self._opened = opened
        self.released = False

    def isOpened(self) -> bool:
        return self._opened

    def set(self, _prop: int, _value: int) -> bool:
        return True

    def read(self) -> tuple[bool, object | None]:
        response_index = min(self._index, len(self._responses) - 1)
        ok, frame, delay_s = self._responses[response_index]
        self._index += 1
        if delay_s > 0:
            sleep(delay_s)
        return ok, frame

    def release(self) -> None:
        self.released = True


def test_camera_raises_when_webcam_cannot_open() -> None:
    capture = _ScriptedCapture([], opened=False)

    with pytest.raises(RuntimeError, match="Unable to open webcam"):
        Camera(capture_factory=lambda _device_index: capture)


def test_camera_returns_latest_frame_from_reader_thread() -> None:
    frame = np.ones((4, 4, 3), dtype=np.uint8)
    capture = _ScriptedCapture([(True, frame, 0.0)])
    camera = Camera(capture_factory=lambda _device_index: capture)

    try:
        received = camera.read()
    finally:
        camera.__exit__(None, None, None)

    assert np.array_equal(received, frame)
    assert received is not frame
    assert capture.released is True


def test_camera_raises_when_reader_hits_repeated_failures() -> None:
    capture = _ScriptedCapture([(False, None, 0.0)])
    camera = Camera(
        frame_timeout_s=0.1,
        read_failure_limit=1,
        capture_factory=lambda _device_index: capture,
    )

    with pytest.raises(RuntimeError, match="Unable to read webcam frame"):
        try:
            camera.read()
        finally:
            camera.__exit__(None, None, None)


def test_camera_raises_when_frame_stream_stalls() -> None:
    frame = np.ones((4, 4, 3), dtype=np.uint8)
    capture = _ScriptedCapture(
        [
            (True, frame, 0.0),
            (True, frame, 0.2),
        ]
    )
    camera = Camera(
        frame_timeout_s=0.05,
        stale_after_s=0.02,
        capture_factory=lambda _device_index: capture,
    )

    try:
        first = camera.read()
        assert np.array_equal(first, frame)
        sleep(0.03)
        with pytest.raises(RuntimeError, match="Webcam frame stream stalled"):
            camera.read()
    finally:
        camera.__exit__(None, None, None)
