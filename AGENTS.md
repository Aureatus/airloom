# AGENTS

Project-level guidance for agentic work in the `Incantation` codebase.

## Repository Snapshot

- The repo directory is still `airloom`, but the product/app identity is now `Incantation`.
- The workspace/package identity is now `incantation` with:
  - `@incantation/desktop`
  - `@incantation/shared`
- The repo has three main layers:
  - `apps/desktop`: Electron shell, React renderer, OS input adapters, and runtime mapping logic
  - `apps/vision-service`: Python webcam tracking, gesture state machine, replay tooling, and pose training
  - `packages/shared`: shared Zod schemas and cross-process event/settings contracts
- The runtime boundary is intentional: Python emits input/gesture/debug events, Electron maps them into actions, and the platform adapter injects real OS input.
- Linux/X11 is the primary target. Wayland exists but is intentionally limited and should be treated as secondary.
- The repo now includes always-on overlay windows (`command-hud`, `camera-hud`) in addition to the main desktop app window.
- Internal desktop bridge / IPC namespace is `incantation`, with legacy `airloom` compatibility still present in some places.

## Toolchain & Environment

- Use Bun for JS/TS commands and `uv` for Python commands.
- Root setup/build/test commands live in `package.json`:

```bash
bun run setup
bun run dev
bun run build
bun run test
bun run check
```

- Desktop-only build/test:

```bash
bun run --cwd apps/desktop build
bun test apps/desktop/tests/main
```

- Vision-service-only commands:

```bash
uv sync --directory apps/vision-service
uv run --directory apps/vision-service pytest
uv run --directory apps/vision-service ruff check .
uv run --directory apps/vision-service ty check
```

- Pose training uses the `train` dependency group:

```bash
uv run --directory apps/vision-service --group train python tools/train_pose_classifier.py ...
```

## Project Skills

- Project-local OpenCode skills live under `.opencode/skills/`.
- Use `hand-gesture-recognition` when working on hand landmarks, gesture classification, multi-hand role assignment, calibration, false-positive reduction, or gesture-to-action mapping.
- Use `mediapipe-pose-detection` when working on smoothing, confidence tuning, tracking-loss handling, debug overlays, runtime metrics, or frame-by-frame validation workflows.
- Treat `hand-gesture-recognition` as the primary skill for the current webcam control path in `apps/vision-service`.
- Treat `mediapipe-pose-detection` as a secondary reference skill for motion-pipeline debugging and validation techniques, not as a source of new gesture semantics by itself.

## Core Architecture Rules

- Do not blur the runtime layers.
  - Python should decide gesture state and emit semantic events.
  - Electron should map those semantic events into desktop actions.
  - Input adapters should only inject OS input, not reinterpret gesture meaning.
- Shared event/settings contracts must be updated in `packages/shared` first, then consumed from desktop and vision-service.
- Prefer extending the existing event schema over inventing side channels.
- If a feature needs live visibility, wire it through status/debug state as well as behavior.

## Desktop App Guidance

- Main process behavior lives under `apps/desktop/src/main`.
- Renderer UI lives under `apps/desktop/src/renderer`.
- Product identity and migration helpers live in `apps/desktop/src/main/identity.ts`.
- Overlay windows are created in `apps/desktop/src/main/main.ts`; keep overlay-specific renderer logic query-param driven instead of duplicating entry points.
- Input semantics live in:
  - `apps/desktop/src/main/action-mapper.ts`
  - `apps/desktop/src/main/gesture-runtime.ts`
  - `apps/desktop/src/main/input/*.ts`
- Keep `action-mapper.ts` as the single source of truth for command-mode, click/drag, scroll, workspace stepping, and held key semantics.
- Keep renderer overlays lightweight. The camera HUD and command HUD should stay readable and low-overhead because they are used during live testing while the main app is minimized.
- When changing overlay placement or renderer plumbing, preserve single-instance behavior and always-on-top behavior in `apps/desktop/src/main/main.ts`.
- The renderer currently uses `window.incantation` as the main preload bridge.

## Vision Service Guidance

- Tracking and pose selection live in `apps/vision-service/app/hand_tracking.py`.
- Temporal gesture behavior lives in `apps/vision-service/app/gestures.py`.
- Camera capture pipeline lives in:
  - `apps/vision-service/app/camera.py`
  - `apps/vision-service/app/live_pipeline.py`
  - `apps/vision-service/app/main.py`
- Keep camera work low-latency. Prefer stable practical modes (currently `640x480` + MJPG request) over theoretically higher resolutions/FPS that worsen responsiveness.
- If you add metrics, make sure they reflect actual runtime behavior rather than requested config only.
- Replay fixtures are a first-class test path. If gesture semantics change, update fixtures/tests rather than leaving replay coverage stale.

## Gesture System Principles

- Preserve the strong core loop unless explicitly asked to redesign it:
  - `closed-fist` = pointer clutch / move only
  - `primary-pinch` = click / drag
  - `peace-sign` = push-to-talk
  - `secondary-pinch` = command mode
- Do not reintroduce same-hand accidental drag behavior while the clutch is active.
- Command mode should remain explicit and debuggable:
  - center = right click on release
  - vertical = scroll
  - horizontal = workspace stepping
  - cancel on tracking loss / action-hand disappearance / suppression
- Prefer hysteresis, cancellation, and clear mode transitions over twitchy single-frame triggers.
- When tuning thresholds, bias toward reliability and learnability over maximal sensitivity.

## Pose Model / Training Workflow

- Local captures and trained models are intentionally local-first and should not be committed casually.
- Important local-only paths include:
  - `apps/vision-service/data/pose-captures/`
  - `apps/vision-service/models/pose_classifier_v1.json`
  - `~/.config/@incantation/desktop/`
- Desktop startup now migrates legacy `@airloom` user data forward into `@incantation` paths. Preserve migration behavior when touching identity/path code.
- The training script is `apps/vision-service/tools/train_pose_classifier.py`.
- Use `--exclude-label` for classes that should remain out of the active model.
- The current trainer supports mirrored landmark augmentation from stored raw landmarks. Preserve that behavior when modifying training.
- Do not wipe captures or retrain destructively unless the user explicitly asks.
- If classifier behavior changes, keep capture/training assumptions documented in code/tests.

## Shared Schema Rules

- Any new event/debug payload must be reflected in both:
  - `packages/shared/src/gesture-events.ts`
  - `apps/vision-service/app/protocol.py`
- Any new settings must be reflected in both:
  - `packages/shared/src/settings-schema.ts`
  - desktop settings UI / settings store
- Keep naming consistent across Python and TypeScript (`snake_case` in frame state, `camelCase` in shared desktop-visible debug payloads where already established).

## Testing Expectations

- For desktop behavior changes, update and run:

```bash
bun test apps/desktop/tests/main
```

- For vision-service behavior changes, update and run:

```bash
uv run --directory apps/vision-service pytest
```

- For cross-layer changes, run both plus a desktop build:

```bash
bun run --cwd apps/desktop build
```

- Prefer targeted regression tests for:
  - gesture start/end/cancel semantics
  - action mapper behavior
  - replay fixtures
  - overlay/event-dispatch behavior
- If you change replay semantics, update `apps/vision-service/tests/test_replay.py` and its fixtures.
- If you change camera or pipeline timing/metrics, update `apps/vision-service/tests/test_camera.py`, `apps/vision-service/tests/test_live_pipeline.py`, or `apps/vision-service/tests/test_main.py` as appropriate.

## UI / UX Principles

- Favor practical, legible, high-signal interfaces over decorative complexity.
- Current visual language is intentionally occult / hex / sigil themed, but operational labels should remain literal and functional (`Scroll`, `Workspace`, `Right click`, `Command mode`, etc.).
- Calibration/debug UI should help diagnose real gesture problems quickly:
  - pointer vs action hand separation
  - command mode state
  - camera/frame/FPS/delay visibility
  - fallback/cancellation reasons
- Overlays should be minimal but always useful in live testing.
- Keep camera HUD and command HUD readable at glance-sized dimensions.
- When simplifying UI, remove bloat rather than layering on more panels.

## Performance & Responsiveness

- Distinguish between requested camera FPS and effective processed FPS.
- If tracking feels worse, inspect capture FPS, processed FPS, preview FPS, and delay before guessing.
- Be cautious with heavy renderer work in always-on overlays.
- Prefer coalescing latest-value streams for pointer/command/preview paths where appropriate.
- Avoid preview features that make live control meaningfully laggier.

## Safety / Change Guardrails

- Never revert unrelated user changes.
- Do not commit local models, capture dumps, or secrets.
- Do not push unless explicitly asked.
- Do not “fix” Wayland by breaking X11 behavior.
- Keep KDE/X11 workflows configurable rather than hardcoding assumptions.
- If a feature is exploratory (for example screenshots or new gestures), gate it behind settings or keep it out of the main path until it is robust.

## Useful Repo Paths

- `apps/desktop/src/main/main.ts` - Electron lifecycle, overlays, service bridge
- `apps/desktop/src/main/identity.ts` - product identity, namespace, and user-data migration
- `apps/desktop/src/main/action-mapper.ts` - gesture-to-action mapping
- `apps/desktop/src/main/gesture-runtime.ts` - runtime execution + state
- `apps/desktop/src/renderer/pages/calibration.tsx` - calibration/debug UI
- `apps/desktop/src/renderer/components/command-hud.tsx` - command overlay
- `apps/desktop/src/renderer/components/camera-hud.tsx` - camera overlay
- `apps/vision-service/app/hand_tracking.py` - hand roles, pointer/action selection
- `apps/vision-service/app/gestures.py` - temporal gesture machine
- `apps/vision-service/app/camera.py` - webcam configuration
- `apps/vision-service/app/live_pipeline.py` - capture/inference/preview loops
- `apps/vision-service/app/main.py` - service entrypoint + debug preview
- `apps/vision-service/tools/train_pose_classifier.py` - local model training
- `packages/shared/src/gesture-events.ts` - shared event contracts
- `packages/shared/src/settings-schema.ts` - shared settings contracts
