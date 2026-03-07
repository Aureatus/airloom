import json

from app.pose_model import load_pose_model, predict_pose_model


def test_pose_model_predicts_primary_pinch_from_simple_artifact(tmp_path) -> None:
    model_path = tmp_path / "pose-model.json"
    model_path.write_text(
        json.dumps(
            {
                "feature_schema_version": 1,
                "feature_names": ["schema_version", "primary_pinch_strength"],
                "labels": ["neutral", "primary-pinch"],
                "mean": [1.0, 0.5],
                "scale": [1.0, 0.2],
                "weights": [[0.0, -1.0], [0.0, 1.0]],
                "bias": [0.0, 0.0],
                "min_probability": 0.55,
                "min_margin": 0.05,
                "model_version": "test-model",
            }
        )
    )

    model = load_pose_model(model_path)
    observation = predict_pose_model(
        model,
        {
            "schema_version": 1.0,
            "primary_pinch_strength": 0.95,
        },
    )

    assert observation["pose"] == "primary-pinch"
    assert observation["scores"]["primary-pinch"] > observation["scores"]["neutral"]
