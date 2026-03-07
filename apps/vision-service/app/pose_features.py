from __future__ import annotations

from dataclasses import dataclass

from app.protocol import Landmark

FEATURE_SCHEMA_VERSION = 1


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


def distance(a: Landmark, b: Landmark) -> float:
    return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5


def compute_pinch_strength(thumb_tip: Landmark, finger_tip: Landmark) -> float:
    return _clamp_unit(1 - (distance(thumb_tip, finger_tip) / 0.25))


@dataclass(frozen=True, slots=True)
class FingerFeatures:
    curled: bool
    extended: bool
    curl_amount: float
    extension_amount: float


@dataclass(frozen=True, slots=True)
class PoseFeatures:
    palm_scale: float
    average_tip_distance: float
    primary_pinch_strength: float
    secondary_pinch_strength: float
    thumb_index_distance: float
    thumb_middle_distance: float
    finger_spread: float
    index: FingerFeatures
    middle: FingerFeatures
    ring: FingerFeatures
    pinky: FingerFeatures
    open_palm_direction: bool

    @property
    def curled_fingers(self) -> int:
        return sum(
            (
                self.index.curled,
                self.middle.curled,
                self.ring.curled,
                self.pinky.curled,
            )
        )

    @property
    def extended_fingers(self) -> int:
        return sum(
            (
                self.index.extended,
                self.middle.extended,
                self.ring.extended,
                self.pinky.extended,
            )
        )


def palm_scale(
    wrist: Landmark, index_mcp: Landmark, middle_mcp: Landmark, pinky_mcp: Landmark
) -> float:
    return max(distance(wrist, middle_mcp), distance(index_mcp, pinky_mcp), 1e-6)


def classify_finger(
    tip: Landmark,
    pip: Landmark,
    mcp: Landmark,
    wrist: Landmark,
    normalized_palm_scale: float,
) -> FingerFeatures:
    tip_to_wrist = distance(tip, wrist) / normalized_palm_scale
    pip_to_wrist = distance(pip, wrist) / normalized_palm_scale
    tip_to_pip = distance(tip, pip) / normalized_palm_scale
    tip_to_mcp = distance(tip, mcp) / normalized_palm_scale

    extension_amount = _clamp_unit(
        ((tip_to_wrist - pip_to_wrist) / 0.45 + (tip_to_mcp - 0.72) / 0.55 + tip_to_pip / 0.6) / 3
    )
    curl_amount = _clamp_unit(((0.7 - tip_to_pip) / 0.35 + (0.9 - tip_to_mcp) / 0.42) / 2)
    curled = tip_to_pip < 0.55 and tip_to_mcp < 0.78
    extended = tip_to_wrist > pip_to_wrist + 0.1 and tip_to_mcp > 0.8 and tip_to_pip > 0.35
    return FingerFeatures(
        curled=curled,
        extended=extended,
        curl_amount=curl_amount,
        extension_amount=extension_amount,
    )


def _normalize_landmark(origin: Landmark, point: Landmark, scale: float) -> tuple[float, float]:
    return ((point["x"] - origin["x"]) / scale, (point["y"] - origin["y"]) / scale)


def extract_pose_features(landmarks: list[Landmark]) -> PoseFeatures:
    wrist = landmarks[0]
    thumb_tip = landmarks[4]
    index_mcp = landmarks[5]
    index_pip = landmarks[6]
    index_tip = landmarks[8]
    middle_mcp = landmarks[9]
    middle_pip = landmarks[10]
    middle_tip = landmarks[12]
    ring_mcp = landmarks[13]
    ring_pip = landmarks[14]
    ring_tip = landmarks[16]
    pinky_mcp = landmarks[17]
    pinky_pip = landmarks[18]
    pinky_tip = landmarks[20]

    normalized_palm_scale = palm_scale(wrist, index_mcp, middle_mcp, pinky_mcp)
    index = classify_finger(index_tip, index_pip, index_mcp, wrist, normalized_palm_scale)
    middle = classify_finger(middle_tip, middle_pip, middle_mcp, wrist, normalized_palm_scale)
    ring = classify_finger(ring_tip, ring_pip, ring_mcp, wrist, normalized_palm_scale)
    pinky = classify_finger(pinky_tip, pinky_pip, pinky_mcp, wrist, normalized_palm_scale)
    average_tip_distance = (
        distance(index_tip, wrist)
        + distance(middle_tip, wrist)
        + distance(ring_tip, wrist)
        + distance(pinky_tip, wrist)
    ) / (4 * normalized_palm_scale)
    thumb_index_distance = distance(thumb_tip, index_tip) / normalized_palm_scale
    thumb_middle_distance = distance(thumb_tip, middle_tip) / normalized_palm_scale
    finger_spread = (
        distance(index_tip, middle_tip)
        + distance(middle_tip, ring_tip)
        + distance(ring_tip, pinky_tip)
    ) / (3 * normalized_palm_scale)

    return PoseFeatures(
        palm_scale=normalized_palm_scale,
        average_tip_distance=average_tip_distance,
        primary_pinch_strength=compute_pinch_strength(thumb_tip, index_tip),
        secondary_pinch_strength=compute_pinch_strength(thumb_tip, middle_tip),
        thumb_index_distance=thumb_index_distance,
        thumb_middle_distance=thumb_middle_distance,
        finger_spread=finger_spread,
        index=index,
        middle=middle,
        ring=ring,
        pinky=pinky,
        open_palm_direction=middle_tip["y"] < wrist["y"],
    )


def flatten_pose_features(landmarks: list[Landmark], features: PoseFeatures) -> dict[str, float]:
    wrist = landmarks[0]
    values: dict[str, float] = {
        "schema_version": float(FEATURE_SCHEMA_VERSION),
        "palm_scale": features.palm_scale,
        "average_tip_distance": features.average_tip_distance,
        "primary_pinch_strength": features.primary_pinch_strength,
        "secondary_pinch_strength": features.secondary_pinch_strength,
        "thumb_index_distance": features.thumb_index_distance,
        "thumb_middle_distance": features.thumb_middle_distance,
        "finger_spread": features.finger_spread,
        "open_palm_direction": 1.0 if features.open_palm_direction else 0.0,
        "curled_fingers": float(features.curled_fingers),
        "extended_fingers": float(features.extended_fingers),
        "index_curled": 1.0 if features.index.curled else 0.0,
        "index_extended": 1.0 if features.index.extended else 0.0,
        "index_curl_amount": features.index.curl_amount,
        "index_extension_amount": features.index.extension_amount,
        "middle_curled": 1.0 if features.middle.curled else 0.0,
        "middle_extended": 1.0 if features.middle.extended else 0.0,
        "middle_curl_amount": features.middle.curl_amount,
        "middle_extension_amount": features.middle.extension_amount,
        "ring_curled": 1.0 if features.ring.curled else 0.0,
        "ring_extended": 1.0 if features.ring.extended else 0.0,
        "ring_curl_amount": features.ring.curl_amount,
        "ring_extension_amount": features.ring.extension_amount,
        "pinky_curled": 1.0 if features.pinky.curled else 0.0,
        "pinky_extended": 1.0 if features.pinky.extended else 0.0,
        "pinky_curl_amount": features.pinky.curl_amount,
        "pinky_extension_amount": features.pinky.extension_amount,
    }
    for index, landmark in enumerate(landmarks):
        normalized_x, normalized_y = _normalize_landmark(wrist, landmark, features.palm_scale)
        values[f"lm_{index}_x"] = normalized_x
        values[f"lm_{index}_y"] = normalized_y
    return values
