---
name: mediapipe-pose-detection
description: Apply MediaPipe pose-detection practices for confidence tuning, smoothing, debugging, and manual validation of webcam motion pipelines.
compatibility: opencode
metadata:
  source: feniix/kinemotion
  focus: mediapipe-pose
---

## What I do

- Provide practical guidance for MediaPipe pose pipelines.
- Help tune confidence thresholds, smoothing, tracking-loss handling, and debug overlays.
- Encourage frame-accurate manual validation instead of guessing from aggregate metrics.

## When to use me

Use this skill for:

- MediaPipe pose landmark work
- smoothing and jitter reduction
- confidence threshold tuning
- video-processing and webcam-pipeline debugging
- validation workflows for timing-sensitive motion analysis

## Core guidance

- Adjust detection and tracking confidence in small increments.
- Increase thresholds for jitter and false detections.
- Decrease thresholds for repeated tracking loss and dropped landmarks.
- Smooth landmarks with low-latency filters when jitter harms control quality.
- Distinguish requested camera settings from actual runtime performance.

## Useful techniques

- Butterworth or One-Euro filtering for jitter reduction.
- Interpolate only short landmark gaps; do not hide chronic tracking failures.
- Read actual frame dimensions from decoded frames instead of trusting metadata.
- Treat visibility or confidence scores as first-class inputs when deciding whether to trust a landmark.
- Keep debug overlays simple and legible so landmark failures are obvious.

## Validation workflow

- Generate debug videos or replay runs that expose landmarks and phase changes.
- Step frame by frame to establish manual ground truth.
- Record detected frame, manual frame, frame error, and notes.
- Look for systematic bias, not just average error.
- Investigate errors above a small frame threshold before changing core semantics.

## Failure modes to watch

- landmark jitter mistaken for gesture intent
- left/right swaps under occlusion or side views
- short tracking dropouts hidden by too much smoothing
- low confidence caused by lighting, contrast, or motion blur
- relying on metadata dimensions when rotation changes the real frame shape

## Review lens

When reviewing a motion pipeline, check:

- whether confidence and visibility drive fallback behavior
- whether smoothing preserves responsiveness
- whether tracking-loss handling is explicit
- whether manual validation backs up claimed improvements
