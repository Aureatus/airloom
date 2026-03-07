from __future__ import annotations

# pyright: reportMissingImports=false
import importlib
import importlib.util
import os
import time
from dataclasses import dataclass, field
from typing import Any, cast

from app.gestures import compute_pinch_strength
from app.model_assets import ensure_hand_landmarker_model
from app.protocol import FrameState, Landmark
from app.smoothing import ExponentialSmoother

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


def _distance(a: Landmark, b: Landmark) -> float:
    return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5


def _palm_scale(
    wrist: Landmark, index_mcp: Landmark, middle_mcp: Landmark, pinky_mcp: Landmark
) -> float:
    return max(_distance(wrist, middle_mcp), _distance(index_mcp, pinky_mcp), 1e-6)


def _is_curled_finger(tip: Landmark, pip: Landmark, mcp: Landmark, palm_scale: float) -> bool:
    return _distance(tip, pip) < palm_scale * 0.55 and _distance(tip, mcp) < palm_scale * 0.78


def _is_closed_fist(
    wrist: Landmark,
    index_tip: Landmark,
    index_pip: Landmark,
    index_mcp: Landmark,
    middle_tip: Landmark,
    middle_pip: Landmark,
    middle_mcp: Landmark,
    ring_tip: Landmark,
    ring_pip: Landmark,
    ring_mcp: Landmark,
    pinky_tip: Landmark,
    pinky_pip: Landmark,
    pinky_mcp: Landmark,
    pinch_strength: float,
    secondary_pinch_strength: float,
) -> bool:
    palm_scale = _palm_scale(wrist, index_mcp, middle_mcp, pinky_mcp)
    curled_fingers = sum(
        (
            _is_curled_finger(index_tip, index_pip, index_mcp, palm_scale),
            _is_curled_finger(middle_tip, middle_pip, middle_mcp, palm_scale),
            _is_curled_finger(ring_tip, ring_pip, ring_mcp, palm_scale),
            _is_curled_finger(pinky_tip, pinky_pip, pinky_mcp, palm_scale),
        )
    )
    average_tip_distance = (
        _distance(index_tip, wrist)
        + _distance(middle_tip, wrist)
        + _distance(ring_tip, wrist)
        + _distance(pinky_tip, wrist)
    ) / 4
    return (
        curled_fingers >= 3
        and average_tip_distance < palm_scale * 1.9
        and pinch_strength < 0.55
        and secondary_pinch_strength < 0.55
    )


@dataclass
class HandTracker:
    smoothing_alpha: float = field(
        default_factory=lambda: float(os.environ.get("AIRLOOM_SMOOTHING_ALPHA", "0.72"))
    )
    mirror_x: bool = field(default_factory=lambda: os.environ.get("AIRLOOM_MIRROR_X", "1") != "0")
    _smoother: ExponentialSmoother = field(init=False)
    _hands: Any | None = field(init=False, default=None)
    _mediapipe: Any | None = field(init=False, default=None)

    def __post_init__(self) -> None:
        self._smoother = ExponentialSmoother(alpha=self.smoothing_alpha)
        mediapipe = (
            importlib.import_module("mediapipe") if importlib.util.find_spec("mediapipe") else None
        )
        if mediapipe is not None:
            self._mediapipe = cast(Any, mediapipe)
            tasks = importlib.import_module("mediapipe.tasks.python")
            vision = importlib.import_module("mediapipe.tasks.python.vision")
            model_path = ensure_hand_landmarker_model()
            options = vision.HandLandmarkerOptions(
                base_options=tasks.BaseOptions(model_asset_path=str(model_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=1,
                min_hand_detection_confidence=0.55,
                min_hand_presence_confidence=0.55,
                min_tracking_confidence=0.55,
            )
            self._hands = vision.HandLandmarker.create_from_options(options)

    def process(self, frame: Any) -> FrameState:
        if self._hands is None or self._mediapipe is None:
            return {
                "tracking": False,
                "pinch_strength": 0.0,
                "secondary_pinch_strength": 0.0,
                "open_palm_hold": False,
                "closed_fist": False,
                "confidence": 0.0,
                "brightness": 0.0,
            }

        import cv2

        brightness = float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean() / 255.0)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._mediapipe.Image(
            image_format=self._mediapipe.ImageFormat.SRGB,
            data=rgb_frame,
        )
        timestamp_ms = time.monotonic_ns() // 1_000_000
        result = self._hands.detect_for_video(image, timestamp_ms)
        if not result.hand_landmarks:
            return {
                "tracking": False,
                "pinch_strength": 0.0,
                "secondary_pinch_strength": 0.0,
                "open_palm_hold": False,
                "closed_fist": False,
                "confidence": 0.0,
                "brightness": brightness,
            }

        landmarks = result.hand_landmarks[0]
        index_tip: Landmark = cast(Landmark, {"x": landmarks[8].x, "y": landmarks[8].y})
        thumb_tip: Landmark = cast(Landmark, {"x": landmarks[4].x, "y": landmarks[4].y})
        middle_tip: Landmark = cast(Landmark, {"x": landmarks[12].x, "y": landmarks[12].y})
        ring_tip: Landmark = cast(Landmark, {"x": landmarks[16].x, "y": landmarks[16].y})
        pinky_tip: Landmark = cast(Landmark, {"x": landmarks[20].x, "y": landmarks[20].y})
        index_pip: Landmark = cast(Landmark, {"x": landmarks[6].x, "y": landmarks[6].y})
        middle_pip: Landmark = cast(Landmark, {"x": landmarks[10].x, "y": landmarks[10].y})
        ring_pip: Landmark = cast(Landmark, {"x": landmarks[14].x, "y": landmarks[14].y})
        pinky_pip: Landmark = cast(Landmark, {"x": landmarks[18].x, "y": landmarks[18].y})
        index_mcp: Landmark = cast(Landmark, {"x": landmarks[5].x, "y": landmarks[5].y})
        middle_mcp: Landmark = cast(Landmark, {"x": landmarks[9].x, "y": landmarks[9].y})
        ring_mcp: Landmark = cast(Landmark, {"x": landmarks[13].x, "y": landmarks[13].y})
        pinky_mcp: Landmark = cast(Landmark, {"x": landmarks[17].x, "y": landmarks[17].y})
        wrist: Landmark = cast(Landmark, {"x": landmarks[0].x, "y": landmarks[0].y})
        pinch_strength = compute_pinch_strength(thumb_tip, index_tip)
        secondary_pinch_strength = compute_pinch_strength(thumb_tip, middle_tip)
        pointer_x = 1 - index_tip["x"] if self.mirror_x else index_tip["x"]
        smooth_x, smooth_y = self._smoother.update(
            _clamp_unit(pointer_x), _clamp_unit(index_tip["y"])
        )

        return {
            "tracking": True,
            "pointer": {"x": _clamp_unit(smooth_x), "y": _clamp_unit(smooth_y)},
            "pinch_strength": pinch_strength,
            "secondary_pinch_strength": secondary_pinch_strength,
            "open_palm_hold": middle_tip["y"] < wrist["y"],
            "closed_fist": _is_closed_fist(
                wrist,
                index_tip,
                index_pip,
                index_mcp,
                middle_tip,
                middle_pip,
                middle_mcp,
                ring_tip,
                ring_pip,
                ring_mcp,
                pinky_tip,
                pinky_pip,
                pinky_mcp,
                pinch_strength,
                secondary_pinch_strength,
            ),
            "confidence": 0.9,
            "brightness": brightness,
        }
