# Incantation

Spell-inspired desktop gesture control with webcam, Leap, and Quest bridge backends.

## Stack

- Electron + React + TypeScript
- Bun workspaces + Biome
- Python vision service with `uv`, `ruff`, and `ty`

## Commands

```bash
bun run setup
bun run setup:leap
bun run check:leap
bun run dev
bun run test
bun run test:leap
bun run test:report
bun run report:open
bun run test:report:open
bun run check
```

## Notes

- `bun run setup` installs Bun deps, syncs the Python vision-service environment with `uv`, and builds the workspace.
- `bun run setup:leap` runs the normal workspace setup, then installs the Ultraleap Gemini runtime on Linux/amd64 via apt and builds the Python `leap` bindings into `apps/vision-service`.
- `bun run setup:leap:bindings` reinstalls only the Python `leap` bindings after the Gemini runtime is already present.
- `bun run check:leap` performs a read-only verification that the Gemini runtime files are present and that `apps/vision-service` can import the Python `leap` bindings.
- `bun run test:leap` performs a base-level Ultraleap smoke test: service status, `leapctl devices`, USB presence, and a short Python tracking probe.
- Linux support starts with X11 input injection.
- Wayland support is detected but intentionally limited in the first version.
- The Python service supports replay fixtures so gesture behavior can be validated without a live webcam.
- Quest Bridge adds a browser-served Stage-1 `Quest 3 -> local Linux laptop` path that keeps the existing Python gesture engine and X11 desktop mapper in place.
- Quest Bridge currently serves a lightweight WebXR client from `apps/vision-service/web/quest-bridge`; set `INCANTATION_QUEST_TLS_CERT` and `INCANTATION_QUEST_TLS_KEY` if you want the built-in bridge server to run over HTTPS/WSS for Quest Browser secure-context requirements.
- The scripted Gemini install currently targets Ubuntu/Debian-style Linux systems with `apt-get`, `sudo`, and the official Ultraleap repository.
- On first live vision startup, Incantation may download the MediaPipe hand landmarker model into `~/.cache/incantation/models`.
- Default gestures are index tracking for pointer move, thumb-index pinch for click/drag with a configurable hold threshold, thumb-middle pinch for right click, and open-palm hold for mapped keybinds.
- `xdotool` is the current Linux X11 backend; it is not guaranteed to be preinstalled, so Incantation now warns in-app when it is missing.
- `bun run test:smoke:x11` now runs headlessly under `xvfb-run`, so it does not steal focus from your real desktop session.
- `bun run test:smoke:pipeline` adds a higher-order headless smoke suite that runs Electron + Python replay fixtures + the real X11 adapter together.
- `bun run test:report` writes JUnit XML reports to `reports/junit`, which keeps the project compatible with open-source JUnit viewers and CI parsers.
- `bun run report:open` renders an HTML report from the JUnit XML set using the open-source `xunit-viewer` tool and opens it when possible.
- `bun run test:report:open` regenerates the reports and then opens the HTML view.
- The runtime boundary is now explicit: Python emits gesture intent, Electron maps intent to actions, and the adapter injects OS events.
- Quest Bridge preserves that same boundary: the headset streams landmarks, Python still decides per-frame pose state, and Electron still owns desktop actions.
- The calibration screen now shows live pinch hold time and a click-vs-drag preview from the desktop action mapper.
