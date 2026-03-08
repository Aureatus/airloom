import json

import numpy as np

from tools.train_pose_classifier import _select_validation_split, load_training_rows


def test_load_training_rows_uses_landmarks_and_mirror_augmentation(tmp_path) -> None:
    captures = tmp_path / "captures"
    session = captures / "session-1"
    session.mkdir(parents=True)

    landmarks = [
        {"x": 0.5, "y": 0.82},
        {"x": 0.5, "y": 0.5},
        {"x": 0.5, "y": 0.5},
        {"x": 0.5, "y": 0.5},
        {"x": 0.44, "y": 0.62},
        {"x": 0.38, "y": 0.63},
        {"x": 0.33, "y": 0.44},
        {"x": 0.5, "y": 0.5},
        {"x": 0.27, "y": 0.16},
        {"x": 0.5, "y": 0.6},
        {"x": 0.47, "y": 0.39},
        {"x": 0.5, "y": 0.5},
        {"x": 0.45, "y": 0.1},
        {"x": 0.61, "y": 0.63},
        {"x": 0.6, "y": 0.43},
        {"x": 0.5, "y": 0.5},
        {"x": 0.62, "y": 0.15},
        {"x": 0.72, "y": 0.67},
        {"x": 0.72, "y": 0.49},
        {"x": 0.5, "y": 0.5},
        {"x": 0.77, "y": 0.26},
    ]
    (session / "take.json").write_text(
        json.dumps(
            {
                "label": "open-palm",
                "sessionId": "session-1",
                "frames": [
                    {
                        "tracking": True,
                        "landmarks": landmarks,
                        "features": {"schema_version": 999.0},
                    }
                ],
            }
        )
    )

    feature_names, rows, labels, sessions = load_training_rows(captures, stride=1)

    assert rows.shape[0] == 2
    assert labels.tolist() == ["open-palm", "open-palm"]
    assert sessions == ["session-1", "session-1"]
    x_index = feature_names.index("lm_8_x")
    assert rows[0][x_index] == -rows[1][x_index]
    assert (
        rows[0][feature_names.index("schema_version")]
        == rows[1][feature_names.index("schema_version")]
    )


def test_select_validation_split_prefers_sessions_covering_all_labels() -> None:
    labels = np.array(
        [
            "closed-fist",
            "closed-fist",
            "neutral",
            "open-palm",
            "neutral",
            "open-palm",
            "primary-pinch",
            "secondary-pinch",
            "peace-sign",
            "primary-pinch",
            "secondary-pinch",
            "peace-sign",
            "closed-fist",
        ]
    )
    sessions = [
        "session-a",
        "session-a",
        "session-a",
        "session-b",
        "session-b",
        "session-c",
        "session-c",
        "session-c",
        "session-d",
        "session-e",
        "session-e",
        "session-e",
        "session-f",
    ]

    train_mask, validation_refs = _select_validation_split(labels, sessions)

    assert train_mask.any()
    assert (~train_mask).any()
    assert {str(label) for label in labels[train_mask]} == {str(label) for label in labels}
    assert {str(label) for label in labels[~train_mask]} == {str(label) for label in labels}
    assert validation_refs == {"session-a", "session-c", "session-d"}
