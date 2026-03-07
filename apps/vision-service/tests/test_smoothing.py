from app.smoothing import ExponentialSmoother


def test_smoother_anchors_first_point() -> None:
    smoother = ExponentialSmoother(alpha=0.35)

    assert smoother.update(0.2, 0.4) == (0.2, 0.4)


def test_smoother_blends_follow_up_points() -> None:
    smoother = ExponentialSmoother(alpha=0.5)

    smoother.update(0.0, 0.0)
    blended = smoother.update(1.0, 1.0)

    assert blended == (0.5, 0.5)
