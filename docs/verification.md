# Verification

## Local commands

```bash
bun install
bun run dev
bun test apps/desktop/tests/main
uv run --directory apps/vision-service pytest
uv run --directory apps/vision-service python -m app.main --stdio --fixture tests/fixtures/landmark_sequences/open-palm-enter.json
```

## Validation strategy

- Use replay fixtures for deterministic gesture validation.
- Use Electron mock buttons to exercise click/key paths without a live webcam.
- On Linux X11, install `xdotool` to enable real pointer and key injection.
