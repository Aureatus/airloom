from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ExponentialSmoother:
    alpha: float
    _x: float | None = None
    _y: float | None = None

    def update(self, x: float, y: float) -> tuple[float, float]:
        if self._x is None or self._y is None:
            self._x = x
            self._y = y
            return x, y

        self._x = (self.alpha * x) + ((1 - self.alpha) * self._x)
        self._y = (self.alpha * y) + ((1 - self.alpha) * self._y)
        return self._x, self._y
