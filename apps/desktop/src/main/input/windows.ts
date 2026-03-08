import type { InputAdapter } from "./types";

const unsupported = async () => {
  throw new Error("Windows input adapter is not implemented yet");
};

export const createWindowsAdapter = (): InputAdapter => {
  return {
    platform: "windows",
    isAvailable: () => process.platform === "win32",
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
