from __future__ import annotations

from dataclasses import dataclass


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


@dataclass(slots=True)
class ExponentialSmoother:
    alpha: float
    min_alpha: float | None = None
    motion_scale: float = 0.04
    deadzone: float = 0.0025
    _x: float | None = None
    _y: float | None = None

    def __post_init__(self) -> None:
        self.alpha = _clamp_unit(self.alpha)
        if self.min_alpha is not None:
            self.min_alpha = min(self.alpha, _clamp_unit(self.min_alpha))
        self.motion_scale = max(self.motion_scale, 1e-6)
        self.deadzone = max(0.0, self.deadzone)

    def update(self, x: float, y: float) -> tuple[float, float]:
        if self._x is None or self._y is None:
            self._x = x
            self._y = y
            return x, y

        delta_x = x - self._x
        delta_y = y - self._y
        distance = (delta_x * delta_x + delta_y * delta_y) ** 0.5
        if distance <= self.deadzone:
            return self._x, self._y

        adaptive_min_alpha = self.alpha * 0.28 if self.min_alpha is None else self.min_alpha
        motion_ratio = min(1.0, max(0.0, (distance - self.deadzone) / self.motion_scale))
        adaptive_alpha = adaptive_min_alpha + ((self.alpha - adaptive_min_alpha) * motion_ratio)

        self._x = (adaptive_alpha * x) + ((1 - adaptive_alpha) * self._x)
        self._y = (adaptive_alpha * y) + ((1 - adaptive_alpha) * self._y)
        return self._x, self._y
