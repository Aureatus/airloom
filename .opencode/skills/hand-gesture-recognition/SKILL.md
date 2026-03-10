---
name: hand-gesture-recognition
description: Use MediaPipe hand landmarks to build reliable real-time gesture tracking, calibration, and gesture-to-action mapping.
compatibility: opencode
metadata:
  source: omer-metin/skills-for-antigravity
  focus: hand-tracking
---

## What I do

- Design and debug hand-tracking systems built on landmark detection.
- Help tune gesture classification, multi-hand role assignment, and gesture-to-action mapping.
- Bias toward low false positives, low latency, and gestures people can perform reliably.

## When to use me

Use this skill for:

- MediaPipe Hands integration
- real-time hand landmark processing
- custom hand gesture classification
- multi-hand tracking and handedness handling
- calibration and reliability work for webcam gesture UX

## Core guidance

- Prefer simple gestures over complex finger vocabularies.
- False positives are usually worse than false negatives for UX.
- Webcam quality, framing, and lighting matter as much as model logic.
- Handle edge-of-frame, overlap, occlusion, and handedness confusion explicitly.
- Start with 2D landmarks and only add more complexity when the current system is clearly insufficient.

## Build patterns

- Separate raw landmark detection from gesture semantics and from action mapping.
- Use explicit frame counters, hysteresis, and cancellation paths instead of single-frame triggers.
- Check landmark confidence before using tips, anchors, or handedness labels.
- Keep multi-hand role assignment debuggable and resilient when handedness is missing.
- Maintain a visible debug path for pointer anchor, active gesture, confidence, fallback reason, and mode transitions.

## Calibration checklist

- Verify lighting before changing thresholds.
- Verify the full hand stays inside frame during intended gestures.
- Test with overlapping fingers, rings, sleeves, and partial occlusion.
- Validate both dominant and non-dominant hands.
- Measure real latency and frame rate before tuning classifier logic.

## Failure modes to watch

- pinch mistaken for grab or fist
- handedness flips during occlusion
- fingertips lost near frame edges
- gestures that demo well but are hard to repeat
- gesture jitter caused by tracking loss rather than bad thresholds

## Review lens

When reviewing a gesture system, check:

- whether gesture semantics are explicit and testable
- whether false-positive prevention is stronger than trigger sensitivity
- whether debug output explains why a gesture did or did not fire
- whether fallback behavior is graceful under tracking loss

## Practical defaults

- Keep the gesture set small and learnable.
- Prefer evidence accumulation over instantaneous activation.
- Add keyboard or non-gesture fallback paths for critical actions.
