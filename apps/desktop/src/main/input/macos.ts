import type { InputAdapter } from "./types";

const unsupported = async () => {
  throw new Error("macOS input adapter is not implemented yet");
};

export const createMacosAdapter = (): InputAdapter => {
  return {
    platform: "macos",
    isAvailable: () => process.platform === "darwin",
    getPointerPosition: unsupported,
    movePointer: unsupported,
    scroll: unsupported,
    pointerDown: unsupported,
    pointerUp: unsupported,
    click: unsupported,
    tapKey: unsupported,
  };
};
