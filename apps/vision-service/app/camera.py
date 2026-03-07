from __future__ import annotations

# pyright: reportMissingImports=false
from contextlib import AbstractContextManager
from typing import Any


class Camera(AbstractContextManager["Camera"]):
    def __init__(self, device_index: int = 0) -> None:
        import cv2

        self._capture = cv2.VideoCapture(device_index)
        if not self._capture.isOpened():
            raise RuntimeError("Unable to open webcam")

    def read(self) -> Any:
        ok, frame = self._capture.read()
        if not ok:
            raise RuntimeError("Unable to read webcam frame")
        return frame

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self._capture.release()
