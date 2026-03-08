from app.pose_features import (
    FEATURE_SCHEMA_VERSION,
    extract_pose_features,
    flatten_pose_features,
    mirror_landmarks_horizontally,
)
from app.protocol import Landmark


def landmark(x: float, y: float) -> Landmark:
    return {"x": x, "y": y}


def base_landmarks() -> list[Landmark]:
    points = [landmark(0.5, 0.5) for _ in range(21)]
    points[0] = landmark(0.5, 0.82)
    points[4] = landmark(0.44, 0.62)
    points[5] = landmark(0.38, 0.63)
    points[6] = landmark(0.33, 0.44)
    points[8] = landmark(0.27, 0.16)
    points[9] = landmark(0.5, 0.6)
    points[10] = landmark(0.47, 0.39)
    points[12] = landmark(0.45, 0.1)
    points[13] = landmark(0.61, 0.63)
    points[14] = landmark(0.6, 0.43)
    points[16] = landmark(0.62, 0.15)
    points[17] = landmark(0.72, 0.67)
    points[18] = landmark(0.72, 0.49)
    points[20] = landmark(0.77, 0.26)
    return points


def test_extract_pose_features_marks_open_palm_fingers_extended() -> None:
    features = extract_pose_features(base_landmarks())

    assert features.extended_fingers >= 3
    assert features.curled_fingers == 0
    assert features.open_palm_direction is True


def test_extract_pose_features_marks_closed_fist_fingers_curled() -> None:
    points = base_landmarks()
    points[4] = landmark(0.47, 0.71)
    points[6] = landmark(0.43, 0.69)
    points[8] = landmark(0.46, 0.74)
    points[10] = landmark(0.5, 0.68)
    points[12] = landmark(0.51, 0.73)
    points[14] = landmark(0.57, 0.7)
    points[16] = landmark(0.56, 0.74)
    points[18] = landmark(0.63, 0.73)
    points[20] = landmark(0.61, 0.76)

    features = extract_pose_features(points)

    assert features.curled_fingers >= 4
    assert features.extended_fingers == 0


def test_flatten_pose_features_exposes_stable_numeric_vector() -> None:
    points = base_landmarks()
    features = extract_pose_features(points)
    values = flatten_pose_features(points, features)

    assert values["schema_version"] == FEATURE_SCHEMA_VERSION
    assert "primary_pinch_strength" in values
    assert "lm_0_x" in values
    assert "lm_20_y" in values


def test_mirror_landmarks_horizontally_reflects_points_around_wrist_x() -> None:
    points = base_landmarks()

    mirrored = mirror_landmarks_horizontally(points)

    assert mirrored[0]["x"] == points[0]["x"]
    assert mirrored[8]["x"] == points[0]["x"] + (points[0]["x"] - points[8]["x"])
    assert mirrored[8]["y"] == points[8]["y"]
