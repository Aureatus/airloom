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

const runXdotoolCapture = async (args: string[]) => {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("xdotool", args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          `xdotool exited with code ${code ?? -1}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
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
    getPointerPosition: async () => {
      const output = await runXdotoolCapture(["getmouselocation", "--shell"]);
      const values = Object.fromEntries(
        output
          .trim()
          .split(/\r?\n/)
          .map((line) => {
            const [key, value] = line.split("=", 2);
            return [key, Number(value)];
          }),
      );

      return {
        x: Number(values.X ?? 0),
        y: Number(values.Y ?? 0),
      };
    },
    movePointer: async (position: PointerPosition) => {
      await runXdotool([
        "mousemove",
        `${Math.round(position.x)}`,
        `${Math.round(position.y)}`,
      ]);
    },
    scroll: async (amount: number) => {
      const steps = Math.max(0, Math.round(Math.abs(amount)));
      if (steps === 0) {
        return;
      }

      await runXdotool([
        "click",
        "--repeat",
        `${steps}`,
        amount > 0 ? "5" : "4",
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
