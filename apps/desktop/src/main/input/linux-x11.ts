import { spawn, spawnSync } from "node:child_process";
import type { InputAdapter, PointerButton, PointerPosition } from "./types";

export const isXdotoolInstalled = () => {
  return spawnSync("xdotool", ["--version"], { stdio: "ignore" }).status === 0;
};

export const getLinuxX11DependencyWarning = () => {
  if (process.platform !== "linux" || !process.env.DISPLAY) {
    return null;
  }

  if (isXdotoolInstalled()) {
    return null;
  }

  return "X11 control requires xdotool. Install it with `sudo apt install xdotool`.";
};

const runXdotool = async (args: string[]) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("xdotool", args);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`xdotool exited with code ${code ?? -1}`));
    });
  });
};

const buttonCode = (button: PointerButton) => {
  return button === "left" ? "1" : "3";
};

export const createLinuxX11Adapter = (): InputAdapter => {
  return {
    platform: "linux-x11",
    isAvailable: () =>
      process.platform === "linux" && Boolean(process.env.DISPLAY),
    movePointer: async (position: PointerPosition) => {
      await runXdotool([
        "mousemove",
        `${Math.round(position.x)}`,
        `${Math.round(position.y)}`,
      ]);
    },
    pointerDown: async (button: PointerButton) => {
      await runXdotool(["mousedown", buttonCode(button)]);
    },
    pointerUp: async (button: PointerButton) => {
      await runXdotool(["mouseup", buttonCode(button)]);
    },
    click: async (button: PointerButton) => {
      await runXdotool(["click", buttonCode(button)]);
    },
    tapKey: async (key: string) => {
      await runXdotool(["key", key]);
    },
  };
};
