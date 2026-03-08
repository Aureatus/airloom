from app.capture_store import CaptureStore


def test_capture_store_can_discard_multiple_takes_in_order(tmp_path) -> None:
    store = CaptureStore(tmp_path / "captures", tmp_path / "exports")

    store.save_take(
        label="closed-fist",
        frames=[{"seq": 1}],
        classifier_mode="rules",
        mirror_x=True,
        model_version=None,
    )
    store.save_take(
        label="primary-pinch",
        frames=[{"seq": 2}],
        classifier_mode="rules",
        mirror_x=True,
        model_version=None,
    )

    assert store.take_count == 2
    assert store.last_take_id is not None

    assert store.discard_last_take() is True
    assert store.take_count == 1
    assert store.counts["primary-pinch"] == 0
    assert store.counts["closed-fist"] == 1
    assert store.last_take_id is not None

    assert store.discard_last_take() is True
    assert store.take_count == 0
    assert store.counts["closed-fist"] == 0
    assert store.last_take_id is None
    assert store.discard_last_take() is False
