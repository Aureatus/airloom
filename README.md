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
bun run check
```

## Notes

- Linux support starts with X11 input injection.
- Wayland support is detected but intentionally limited in the first version.
- The Python service supports replay fixtures so gesture behavior can be validated without a live webcam.
- Default gestures are index tracking for pointer move, thumb-index pinch for click/drag, thumb-middle pinch for right click, and open-palm hold for mapped keybinds.
