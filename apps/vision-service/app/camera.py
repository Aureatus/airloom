from __future__ import annotations

# pyright: reportMissingImports=false
from contextlib import AbstractContextManager
from threading import Condition, Event, Thread
from time import monotonic, sleep
from typing import Any


class Camera(AbstractContextManager["Camera"]):
    def __init__(
        self,
        device_index: int = 0,
        frame_timeout_s: float = 1.0,
        stale_after_s: float = 1.0,
        read_failure_limit: int = 5,
        frame_width: int = 640,
        frame_height: int = 480,
        target_fps: int = 60,
        capture_factory: Any | None = None,
    ) -> None:
        import cv2

        factory = capture_factory or cv2.VideoCapture
        self._capture = factory(device_index)
        if not self._capture.isOpened():
            raise RuntimeError("Unable to open webcam")

        self._capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, max(160, frame_width))
        self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, max(120, frame_height))
        self._capture.set(cv2.CAP_PROP_FPS, max(1, target_fps))

        self._frame_timeout_s = frame_timeout_s
        self._stale_after_s = stale_after_s
        self._read_failure_limit = max(1, read_failure_limit)
        self._condition = Condition()
        self._stop_event = Event()
        self._latest_frame: Any | None = None
        self._latest_frame_seq = 0
        self._latest_frame_at = 0.0
        self._reader_error: RuntimeError | None = None
        self._reader = Thread(target=self._reader_loop, name="airloom-camera", daemon=True)
        self._reader.start()

    def _reader_loop(self) -> None:
        consecutive_failures = 0

        while not self._stop_event.is_set():
            ok, frame = self._capture.read()
            if not ok:
                consecutive_failures += 1
                if consecutive_failures >= self._read_failure_limit:
                    with self._condition:
                        self._reader_error = RuntimeError("Unable to read webcam frame")
                        self._condition.notify_all()
                    return

                sleep(0.01)
                continue

            consecutive_failures = 0
            with self._condition:
                self._latest_frame = frame
                self._latest_frame_seq += 1
                self._latest_frame_at = monotonic()
                self._condition.notify_all()

    def read(self) -> Any:
        return self.read_with_metadata()[2]

    def read_with_metadata(self, after_seq: int = 0) -> tuple[int, float, Any]:
        deadline = monotonic() + self._frame_timeout_s

        with self._condition:
            while True:
                if self._reader_error is not None:
                    raise self._reader_error

                if self._latest_frame is not None:
                    age = monotonic() - self._latest_frame_at
                    if self._latest_frame_seq > after_seq and age <= self._stale_after_s:
                        return (
                            self._latest_frame_seq,
                            self._latest_frame_at,
                            self._latest_frame.copy(),
                        )

                remaining = deadline - monotonic()
                if remaining <= 0:
                    if self._latest_frame is None:
                        raise RuntimeError("Timed out waiting for webcam frame")
                    raise RuntimeError("Webcam frame stream stalled")

                self._condition.wait(timeout=remaining)

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self._stop_event.set()
        self._reader.join(timeout=0.5)
        self._capture.release()
