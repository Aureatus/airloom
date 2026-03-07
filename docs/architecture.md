# Airloom Architecture

`airloom` is split into two runtimes:

- `apps/desktop`: Electron shell, renderer UI, and OS input adapters
- `apps/vision-service`: Python gesture engine and replay harness

The Python service emits observation and intent events over stdio JSON lines. The desktop app owns the action-mapping layer and platform-specific input injection.

Current flow:

- vision -> `pointer.observed`, `gesture.intent`, `status`
- action mapper -> `pointer.move`, `pointer.down`, `pointer.up`, `click`, `key.tap`
- input adapter -> real OS mouse and keyboard injection

The desktop action mapper is stateful: it uses a hold threshold to decide whether a `primary-pinch` release should become a click or a drag release.

The calibration UI also surfaces the mapper's live debug state so you can see pinch hold duration and the current click-vs-drag preview while tuning thresholds.
