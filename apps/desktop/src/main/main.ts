import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type AirloomInputEvent,
  parseInputEvent,
} from "@airloom/shared/gesture-events";
import {
  type AirloomSettings,
  parseAirloomSettings,
  settingsSchema,
} from "@airloom/shared/settings-schema";
import { BrowserWindow, app, ipcMain } from "electron";
import { type RuntimeState, createGestureRuntime } from "./gesture-runtime";
import { normalizedToScreenPosition, resolveInputAdapter } from "./input";
import { getLinuxX11DependencyWarning } from "./input/linux-x11";
import { loadSettings, saveSettings } from "./settings-store";

type ServiceStatus = {
  running: boolean;
  adapter: string;
  lastEvent: AirloomInputEvent | null;
  runtime: RuntimeState;
  warnings: string[];
};

const getPlatformWarnings = () => {
  const warnings: string[] = [];
  const x11Warning = getLinuxX11DependencyWarning();

  if (x11Warning) {
    warnings.push(x11Warning);
  }

  if (
    process.platform === "linux" &&
    process.env.XDG_SESSION_TYPE === "wayland"
  ) {
    warnings.push(
      "Wayland support is limited right now. X11 is the best-supported Linux path for Airloom.",
    );
  }

  return warnings;
};

let mainWindow: BrowserWindow | null = null;
const adapter = resolveInputAdapter();
let serviceProcess: ChildProcessWithoutNullStreams | null = null;
let lastEvent: AirloomInputEvent | null = null;
let currentSettings: AirloomSettings = settingsSchema.parse({});
const runtime = createGestureRuntime(
  adapter,
  normalizedToScreenPosition,
  () => currentSettings,
);

const rootDir = resolve(import.meta.dirname, "../../../../");
const visionServiceDir = join(rootDir, "apps/vision-service");
const rendererIndexPath = join(import.meta.dirname, "../renderer/index.html");
const startupDelayMs = Number(process.env.AIRLOOM_STARTUP_DELAY_MS ?? "0");
const headlessMode = process.env.AIRLOOM_HEADLESS === "1";
const exitOnServiceExit = process.env.AIRLOOM_EXIT_ON_SERVICE_EXIT === "1";

const getServiceStatus = (): ServiceStatus => {
  return {
    running: serviceProcess !== null,
    adapter: adapter.platform,
    lastEvent,
    runtime: runtime.getState(),
    warnings: getPlatformWarnings(),
  };
};

const broadcastStatus = () => {
  const status = getServiceStatus();
  mainWindow?.webContents.send("airloom:status", status);
};

const attachProcessReaders = (child: ChildProcessWithoutNullStreams) => {
  let pending = "";

  child.stdout.on("data", async (chunk) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const event = parseInputEvent(JSON.parse(line));
        lastEvent = event;
        await runtime.handleEvent(event);
      } catch (error) {
        console.error("failed to process gesture event", error);
      }

      broadcastStatus();
    }
  });

  child.stderr.on("data", (chunk) => {
    console.error(chunk.toString());
  });

  child.on("exit", () => {
    serviceProcess = null;
    broadcastStatus();

    if (headlessMode && exitOnServiceExit) {
      app.quit();
    }
  });
};

const startVisionService = () => {
  if (serviceProcess !== null) {
    return getServiceStatus();
  }

  const fixture = process.env.AIRLOOM_FIXTURE;
  const args = ["run", "python", "-m", "app.main", "--stdio"];
  if (fixture) {
    args.push("--fixture", fixture);
  }

  serviceProcess = spawn("uv", args, {
    cwd: visionServiceDir,
    env: {
      ...process.env,
      AIRLOOM_SMOOTHING_ALPHA: String(currentSettings.smoothing),
      AIRLOOM_MIRROR_X: "1",
    },
    stdio: "pipe",
  });

  attachProcessReaders(serviceProcess);
  broadcastStatus();
  return getServiceStatus();
};

const stopVisionService = () => {
  if (serviceProcess !== null) {
    serviceProcess.kill();
    serviceProcess = null;
  }

  broadcastStatus();
  return getServiceStatus();
};

const restartVisionService = () => {
  stopVisionService();
  return startVisionService();
};

const createMainWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    backgroundColor: "#081015",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.cjs"),
    },
  });

  if (!existsSync(rendererIndexPath)) {
    throw new Error(`Renderer build missing at ${rendererIndexPath}`);
  }

  await mainWindow.loadFile(rendererIndexPath);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  currentSettings = await loadSettings();

  ipcMain.handle("airloom:get-status", () => getServiceStatus());
  ipcMain.handle("airloom:get-settings", () => currentSettings);
  ipcMain.handle(
    "airloom:update-settings",
    async (_event, payload: unknown) => {
      currentSettings = await saveSettings(parseAirloomSettings(payload));
      if (serviceProcess !== null) {
        restartVisionService();
      }
      broadcastStatus();
      return currentSettings;
    },
  );
  ipcMain.handle("airloom:start-service", () => startVisionService());
  ipcMain.handle("airloom:stop-service", () => stopVisionService());
  ipcMain.handle(
    "airloom:send-event",
    async (_event, payload: AirloomInputEvent) => {
      lastEvent = payload;
      await runtime.handleEvent(payload);
      broadcastStatus();
      return getServiceStatus();
    },
  );

  if (!headlessMode) {
    await createMainWindow();
  }

  if (startupDelayMs > 0) {
    setTimeout(() => {
      startVisionService();
    }, startupDelayMs);
  } else {
    startVisionService();
  }

  if (!headlessMode) {
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  }
});

app.on("window-all-closed", () => {
  stopVisionService();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
