from __future__ import annotations

from threading import Condition
from typing import TypeVar

T = TypeVar("T")


class LatestValue[T]:
    def __init__(self) -> None:
        self._condition = Condition()
        self._version = 0
        self._value: T | None = None

    def publish(self, value: T) -> int:
        with self._condition:
            self._version += 1
            self._value = value
            self._condition.notify_all()
            return self._version

    def get_latest(self) -> tuple[int, T] | None:
        with self._condition:
            if self._value is None:
                return None
            return self._version, self._value

    def wait_for_update(
        self, previous_version: int, timeout: float | None = None
    ) -> tuple[int, T] | None:
        with self._condition:
            if self._value is not None and self._version != previous_version:
                return self._version, self._value

            notified = self._condition.wait(timeout=timeout)
            if not notified or self._value is None or self._version == previous_version:
                return None

            return self._version, self._value
