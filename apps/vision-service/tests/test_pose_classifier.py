from app.pose_classifier import classify_hybrid_pose, classify_pose
from app.pose_features import extract_pose_features
from app.protocol import Landmark, pose_scores_for_pose


def landmark(x: float, y: float) -> Landmark:
    return {"x": x, "y": y}


def open_palm_landmarks() -> list[Landmark]:
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


def closed_fist_landmarks() -> list[Landmark]:
    points = open_palm_landmarks()
    points[4] = landmark(0.47, 0.71)
    points[6] = landmark(0.43, 0.69)
    points[8] = landmark(0.46, 0.74)
    points[10] = landmark(0.5, 0.68)
    points[12] = landmark(0.51, 0.73)
    points[14] = landmark(0.57, 0.7)
    points[16] = landmark(0.56, 0.74)
    points[18] = landmark(0.63, 0.73)
    points[20] = landmark(0.61, 0.76)
    return points


def blade_hand_landmarks() -> list[Landmark]:
    points = open_palm_landmarks()
    points[4] = landmark(0.45, 0.64)
    points[5] = landmark(0.46, 0.63)
    points[6] = landmark(0.47, 0.42)
    points[8] = landmark(0.48, 0.14)
    points[9] = landmark(0.5, 0.61)
    points[10] = landmark(0.5, 0.4)
    points[12] = landmark(0.5, 0.11)
    points[13] = landmark(0.54, 0.63)
    points[14] = landmark(0.53, 0.42)
    points[16] = landmark(0.52, 0.13)
    points[17] = landmark(0.57, 0.66)
    points[18] = landmark(0.55, 0.46)
    points[20] = landmark(0.54, 0.19)
    return points


def primary_pinch_landmarks() -> list[Landmark]:
    points = open_palm_landmarks()
    points[4] = landmark(0.29, 0.2)
    points[8] = landmark(0.31, 0.21)
    points[10] = landmark(0.49, 0.43)
    points[12] = landmark(0.48, 0.19)
    return points


def bent_index_primary_pinch_landmarks() -> list[Landmark]:
    points = primary_pinch_landmarks()
    points[6] = landmark(0.32, 0.36)
    points[8] = landmark(0.33, 0.24)
    return points


def peace_sign_landmarks() -> list[Landmark]:
    points = open_palm_landmarks()
    points[4] = landmark(0.41, 0.6)
    points[14] = landmark(0.58, 0.68)
    points[16] = landmark(0.57, 0.75)
    points[18] = landmark(0.66, 0.7)
    points[20] = landmark(0.64, 0.78)
    return points


def test_classifier_marks_open_palm_cleanly() -> None:
    observation = classify_pose(extract_pose_features(open_palm_landmarks()))

    assert observation["pose"] == "open-palm"


def test_classifier_marks_blade_hand_cleanly() -> None:
    observation = classify_pose(extract_pose_features(blade_hand_landmarks()))

    assert observation["pose"] == "blade-hand"


def test_classifier_marks_closed_fist_even_when_thumb_is_near_index() -> None:
    observation = classify_pose(extract_pose_features(closed_fist_landmarks()))

    assert observation["pose"] == "closed-fist"


def test_classifier_does_not_confuse_fist_with_primary_pinch() -> None:
    fist = classify_pose(extract_pose_features(closed_fist_landmarks()))
    pinch = classify_pose(extract_pose_features(primary_pinch_landmarks()))

    assert fist["pose"] != "primary-pinch"
    assert pinch["pose"] == "primary-pinch"


def test_classifier_accepts_primary_pinch_with_slightly_bent_index() -> None:
    observation = classify_pose(extract_pose_features(bent_index_primary_pinch_landmarks()))

    assert observation["pose"] == "primary-pinch"


def test_classifier_marks_peace_sign_cleanly() -> None:
    observation = classify_pose(extract_pose_features(peace_sign_landmarks()))

    assert observation["pose"] == "peace-sign"


def test_hybrid_classifier_uses_mediapipe_open_palm_label() -> None:
    observation = classify_hybrid_pose(
        extract_pose_features(open_palm_landmarks()),
        static_gesture_scores={"Open_Palm": 0.91},
    )

    assert observation["pose"] == "open-palm"


def test_hybrid_classifier_can_take_blade_hand_from_learned_scores() -> None:
    observation = classify_hybrid_pose(
        extract_pose_features(open_palm_landmarks()),
        static_gesture_scores={"Open_Palm": 0.76, "Closed_Fist": 0.08},
        learned_scores=pose_scores_for_pose("blade-hand", 0.87),
    )

    assert observation["pose"] == "blade-hand"


def test_hybrid_classifier_uses_neutral_when_no_pose_is_strong() -> None:
    observation = classify_hybrid_pose(
        extract_pose_features(open_palm_landmarks()),
        static_gesture_scores={"Closed_Fist": 0.22, "Open_Palm": 0.18},
    )

    assert observation["pose"] == "neutral"


def test_hybrid_classifier_uses_victory_static_label_for_peace_sign() -> None:
    observation = classify_hybrid_pose(
        extract_pose_features(peace_sign_landmarks()),
        static_gesture_scores={"Victory": 0.91},
    )

    assert observation["pose"] == "peace-sign"


def test_hybrid_classifier_can_take_primary_pinch_from_learned_scores() -> None:
    observation = classify_hybrid_pose(
        extract_pose_features(open_palm_landmarks()),
        static_gesture_scores={"Open_Palm": 0.76, "Closed_Fist": 0.08},
        learned_scores=pose_scores_for_pose("primary-pinch", 0.87),
    )

    assert observation["pose"] == "primary-pinch"


def test_hybrid_classifier_prefers_mediapipe_fist_when_learned_pinch_is_weak() -> None:
    observation = classify_hybrid_pose(
        extract_pose_features(closed_fist_landmarks()),
        static_gesture_scores={"Closed_Fist": 0.89, "Open_Palm": 0.06},
        learned_scores=pose_scores_for_pose("primary-pinch", 0.31),
    )

    assert observation["pose"] == "closed-fist"
