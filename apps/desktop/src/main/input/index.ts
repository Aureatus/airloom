import { screen } from "electron";
import { createLinuxWaylandAdapter } from "./linux-wayland";
import { createLinuxX11Adapter } from "./linux-x11";
import { createMacosAdapter } from "./macos";
import type { InputAdapter } from "./types";
import { createWindowsAdapter } from "./windows";

const createUnsupportedAdapter = (): InputAdapter => {
  const unsupported = async () => {
    throw new Error(
      "No supported input adapter is available for this platform",
    );
  };

  return {
    platform: "unsupported",
    isAvailable: () => false,
    getPointerPosition: unsupported,
    movePointer: unsupported,
    scroll: unsupported,
    pointerDown: unsupported,
    pointerUp: unsupported,
    click: unsupported,
    keyDown: unsupported,
    keyUp: unsupported,
    tapKey: unsupported,
  };
};

export const resolveInputAdapter = (): InputAdapter => {
  const adapters = [
    createLinuxWaylandAdapter(),
    createLinuxX11Adapter(),
    createMacosAdapter(),
    createWindowsAdapter(),
  ];

  return (
    adapters.find((adapter) => adapter.isAvailable()) ??
    createUnsupportedAdapter()
  );
};

export const normalizedToScreenPosition = (x: number, y: number) => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const bounds = primaryDisplay.workArea;

  return {
    x: bounds.x + Math.round(bounds.width * x),
    y: bounds.y + Math.round(bounds.height * y),
  };
};
