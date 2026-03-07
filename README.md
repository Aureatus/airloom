# airloom

Webcam-based computer control with gesture input.

## Stack

- Electron + React + TypeScript
- Bun workspaces + Biome
- Python vision service with `uv`, `ruff`, and `ty`

## Commands

```bash
bun install
bun run dev
bun run test
bun run test:report
bun run check
```

## Notes

- Linux support starts with X11 input injection.
- Wayland support is detected but intentionally limited in the first version.
- The Python service supports replay fixtures so gesture behavior can be validated without a live webcam.
- Default gestures are index tracking for pointer move, thumb-index pinch for click/drag with a configurable hold threshold, thumb-middle pinch for right click, and open-palm hold for mapped keybinds.
- `xdotool` is the current Linux X11 backend; it is not guaranteed to be preinstalled, so Airloom now warns in-app when it is missing.
- `bun run test:smoke:x11` now runs headlessly under `xvfb-run`, so it does not steal focus from your real desktop session.
- `bun run test:smoke:pipeline` adds a higher-order headless smoke suite that runs Electron + Python replay fixtures + the real X11 adapter together.
- `bun run test:report` writes JUnit XML reports to `reports/junit`, which keeps the project compatible with open-source JUnit viewers and CI parsers.
- The runtime boundary is now explicit: Python emits gesture intent, Electron maps intent to actions, and the adapter injects OS events.
- The calibration screen now shows live pinch hold time and a click-vs-drag preview from the desktop action mapper.
