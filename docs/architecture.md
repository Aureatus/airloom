# Airloom Architecture

`airloom` is split into two runtimes:

- `apps/desktop`: Electron shell, renderer UI, and OS input adapters
- `apps/vision-service`: Python gesture engine and replay harness

The Python service emits high-level gesture events over stdio JSON lines. The desktop app owns platform-specific input injection and user-facing controls.
