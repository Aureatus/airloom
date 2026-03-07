from app.smoothing import ExponentialSmoother


def test_smoother_anchors_first_point() -> None:
    smoother = ExponentialSmoother(alpha=0.35)

    assert smoother.update(0.2, 0.4) == (0.2, 0.4)


def test_smoother_blends_follow_up_points() -> None:
    smoother = ExponentialSmoother(alpha=0.5, min_alpha=0.5, motion_scale=1.0, deadzone=0.0)

    smoother.update(0.0, 0.0)
    blended = smoother.update(1.0, 1.0)

    assert blended == (0.5, 0.5)


def test_smoother_deadzone_suppresses_tiny_motion() -> None:
    smoother = ExponentialSmoother(alpha=0.8, min_alpha=0.2, motion_scale=0.5, deadzone=0.05)

    smoother.update(0.4, 0.4)
    blended = smoother.update(0.42, 0.42)

    assert blended == (0.4, 0.4)


def test_smoother_uses_more_responsiveness_for_larger_motion() -> None:
    smoother = ExponentialSmoother(alpha=0.8, min_alpha=0.2, motion_scale=1.0, deadzone=0.0)

    smoother.update(0.0, 0.0)
    small_motion = smoother.update(0.1, 0.1)

    faster_smoother = ExponentialSmoother(alpha=0.8, min_alpha=0.2, motion_scale=1.0, deadzone=0.0)
    faster_smoother.update(0.0, 0.0)
    large_motion = faster_smoother.update(0.9, 0.9)

    assert large_motion[0] > small_motion[0]


def test_smoother_clamps_invalid_configuration() -> None:
    smoother = ExponentialSmoother(alpha=1.5, min_alpha=-0.3, motion_scale=0.0, deadzone=-0.1)

    assert smoother.alpha == 1.0
    assert smoother.min_alpha == 0.0
    assert smoother.motion_scale == 1e-6
    assert smoother.deadzone == 0.0
