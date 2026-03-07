import type { InputAdapter } from "./types";

const unsupported = async () => {
  throw new Error("Wayland input injection is not supported yet");
};

export const createLinuxWaylandAdapter = (): InputAdapter => {
  return {
    platform: "linux-wayland",
    isAvailable: () =>
      process.platform === "linux" &&
      process.env.XDG_SESSION_TYPE === "wayland",
    movePointer: unsupported,
    pointerDown: unsupported,
    pointerUp: unsupported,
    click: unsupported,
    tapKey: unsupported,
  };
};
