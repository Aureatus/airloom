import type { InputAdapter } from "./types";

const unsupported = async () => {
  throw new Error("Windows input adapter is not implemented yet");
};

export const createWindowsAdapter = (): InputAdapter => {
  return {
    platform: "windows",
    isAvailable: () => process.platform === "win32",
    movePointer: unsupported,
    pointerDown: unsupported,
    pointerUp: unsupported,
    click: unsupported,
    tapKey: unsupported,
  };
};
