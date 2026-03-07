from __future__ import annotations

import argparse
import json
from pathlib import Path
import tkinter as tk


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Airloom X11 smoke target")
    parser.add_argument("--log", type=Path, required=True)
    return parser.parse_args()


def append_log(path: Path, event: str) -> None:
    existing: list[str] = []
    if path.exists():
        existing = json.loads(path.read_text())

    existing.append(event)
    path.write_text(json.dumps(existing, indent=2))


def main() -> None:
    args = parse_args()
    args.log.parent.mkdir(parents=True, exist_ok=True)
    args.log.write_text("[]")

    root = tk.Tk()
    root.title("Airloom X11 Smoke Target")
    root.geometry("480x320+180+180")
    root.configure(bg="#11212b")

    frame = tk.Frame(root, bg="#11212b", padx=24, pady=24)
    frame.pack(fill="both", expand=True)

    label = tk.Label(
        frame,
        text="Airloom X11 smoke target\nLeft click, right click, then Return.",
        bg="#11212b",
        fg="#f5f8f8",
        font=("Helvetica", 16),
        justify="center",
    )
    label.pack(fill="both", expand=True)

    root.bind("<Button-1>", lambda _event: append_log(args.log, "left-click"))
    root.bind("<Button-3>", lambda _event: append_log(args.log, "right-click"))
    root.bind("<Return>", lambda _event: append_log(args.log, "return"))
    root.after(300, root.focus_force)
    root.mainloop()


if __name__ == "__main__":
    main()
