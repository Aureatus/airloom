import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type AirloomCaptureStateEvent,
  type AirloomInputEvent,
  parseInputEvent,
} from "@airloom/shared/gesture-events";
import {
  type AirloomSettings,
  parseAirloomSettings,
  settingsSchema,
} from "@airloom/shared/settings-schema";
import { BrowserWindow, app, ipcMain } from "electron";
import { createEventDispatcher } from "./event-dispatcher";
import { type RuntimeState, createGestureRuntime } from "./gesture-runtime";
import { normalizedToScreenPosition, resolveInputAdapter } from "./input";
import { getLinuxX11DependencyWarning } from "./input/linux-x11";
import { createPreviewStreamDecoder } from "./preview-stream";
import { loadSettings, saveSettings } from "./settings-store";

type ServiceStatus = {
  running: boolean;
  adapter: string;
  lastEvent: AirloomInputEvent | null;
  runtime: RuntimeState;
  capture: AirloomCaptureStateEvent;
  debugRecording: DebugRecordingState;
  warnings: string[];
};

type DebugRecordingState = {
  recording: boolean;
  sessionPath: string | null;
  frames: number;
  events: number;
};

const defaultCaptureState: AirloomCaptureStateEvent = {
  type: "capture.state",
  sessionId: "pending",
  activeLabel: "neutral",
  recording: false,
  takeCount: 0,
  counts: {
    neutral: 0,
    "open-palm": 0,
    "closed-fist": 0,
    "primary-pinch": 0,
    "secondary-pinch": 0,
  },
  lastTakeId: null,
  exportPath: null,
  message: null,
};

const defaultDebugRecordingState: DebugRecordingState = {
  recording: false,
  sessionPath: null,
  frames: 0,
  events: 0,
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
let serviceProcess: ChildProcess | null = null;
let lastEvent: AirloomInputEvent | null = null;
let captureState: AirloomCaptureStateEvent = defaultCaptureState;
let debugRecordingState: DebugRecordingState = defaultDebugRecordingState;
let eventDispatcher: ReturnType<typeof createEventDispatcher> | null = null;
let currentSettings: AirloomSettings = settingsSchema.parse({});
const runtime = createGestureRuntime(
  adapter,
  normalizedToScreenPosition,
  () => currentSettings,
);

const rootDir = resolve(import.meta.dirname, "../../../../");
const visionServiceDir = join(rootDir, "apps/vision-service");
const rendererIndexPath = join(import.meta.dirname, "../renderer/index.html");
const rendererDevUrl = process.env.AIRLOOM_RENDERER_URL;
const startupDelayMs = Number(process.env.AIRLOOM_STARTUP_DELAY_MS ?? "0");
const headlessMode = process.env.AIRLOOM_HEADLESS === "1";
const exitOnServiceExit = process.env.AIRLOOM_EXIT_ON_SERVICE_EXIT === "1";
const ignoredVisionLogPatterns = [
  "WARNING: All log messages before absl::InitializeLog() is called are written to STDERR",
  "inference_feedback_manager.cc:114",
  "landmark_projection_calculator.cc:78",
];

const getServiceStatus = (): ServiceStatus => {
  return {
    running: serviceProcess !== null,
    adapter: adapter.platform,
    lastEvent,
    runtime: runtime.getState(),
    capture: captureState,
    debugRecording: debugRecordingState,
    warnings: getPlatformWarnings(),
  };
};

const getDebugRecordingDir = () => {
  return join(app.getPath("userData"), "debug-recordings");
};

const recordDebugEvent = (event: AirloomInputEvent) => {
  if (!debugRecordingState.recording || debugRecordingState.sessionPath === null) {
    return;
  }

  debugRecordingState = {
    ...debugRecordingState,
    events: debugRecordingState.events + 1,
  };
  const eventsPath = join(debugRecordingState.sessionPath, "events.jsonl");
  void appendFile(
    eventsPath,
    `${JSON.stringify({ recordedAt: Date.now(), event })}\n`,
  );
};

const recordDebugPreviewFrame = (frame: Uint8Array) => {
  if (!debugRecordingState.recording || debugRecordingState.sessionPath === null) {
    return;
  }

  const nextFrames = debugRecordingState.frames + 1;
  debugRecordingState = {
    ...debugRecordingState,
    frames: nextFrames,
  };
  const previewDir = join(debugRecordingState.sessionPath, "preview");
  const filePath = join(previewDir, `${String(nextFrames).padStart(5, "0")}.jpg`);
  void writeFile(filePath, frame);
};

const startDebugRecording = async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionPath = join(getDebugRecordingDir(), `session-${stamp}`);
  await mkdir(join(sessionPath, "preview"), { recursive: true });
  debugRecordingState = {
    recording: true,
    sessionPath,
    frames: 0,
    events: 0,
  };
  broadcastStatus();
  return getServiceStatus();
};

const stopDebugRecording = async () => {
  if (debugRecordingState.sessionPath !== null) {
    const summaryPath = join(debugRecordingState.sessionPath, "summary.json");
    await writeFile(
      summaryPath,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          frames: debugRecordingState.frames,
          events: debugRecordingState.events,
        },
        null,
        2,
      ),
    );
  }
  debugRecordingState = {
    ...debugRecordingState,
    recording: false,
  };
  broadcastStatus();
  return getServiceStatus();
};

const sendServiceCommand = (payload: object) => {
  if (serviceProcess?.stdin === null || serviceProcess?.stdin === undefined) {
    throw new Error("Vision service is not running");
  }
  serviceProcess.stdin.write(`${JSON.stringify(payload)}\n`);
};

const broadcastStatus = () => {
  const status = getServiceStatus();
  mainWindow?.webContents.send("airloom:status", status);
};

const attachProcessReaders = (child: ChildProcess) => {
  let pending = "";
  eventDispatcher = createEventDispatcher(
    async (event) => {
      await runtime.handleEvent(event);
    },
    () => {
      broadcastStatus();
    },
  );

  child.stdout.on("data", (chunk) => {
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
        recordDebugEvent(event);
        if (event.type === "capture.state") {
          captureState = event;
        }
        eventDispatcher?.enqueue(event);
      } catch (error) {
        console.error("failed to process gesture event", error);
        broadcastStatus();
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (!line.trim()) {
        continue;
      }

      if (ignoredVisionLogPatterns.some((pattern) => line.includes(pattern))) {
        continue;
      }

      console.error(line);
    }
  });

  const previewStream = child.stdio[3];
  if (previewStream !== null && previewStream !== undefined) {
    const decodePreviewFrame = createPreviewStreamDecoder((frame) => {
      recordDebugPreviewFrame(frame);
      mainWindow?.webContents.send("airloom:preview-frame", frame);
    });

    previewStream.on("data", (chunk) => {
      decodePreviewFrame(Buffer.from(chunk));
    });
  }

  child.on("exit", () => {
    eventDispatcher?.stop();
    eventDispatcher = null;
    serviceProcess = null;
    debugRecordingState = {
      ...debugRecordingState,
      recording: false,
    };
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
      AIRLOOM_DEBUG_PREVIEW: "1",
      AIRLOOM_DEBUG_PREVIEW_FPS: "12",
      AIRLOOM_CAPTURE_DIR: join(app.getPath("userData"), "captures"),
      AIRLOOM_CAPTURE_EXPORT_DIR: join(rootDir, "apps/vision-service/data/pose-captures"),
      AIRLOOM_POSE_CLASSIFIER_MODE:
        process.env.AIRLOOM_POSE_CLASSIFIER_MODE ?? "learned",
      AIRLOOM_POSE_MODEL_PATH:
        process.env.AIRLOOM_POSE_MODEL_PATH ??
        join(visionServiceDir, "models/pose_classifier_v1.json"),
      AIRLOOM_SMOOTHING_ALPHA: String(currentSettings.smoothing),
      AIRLOOM_MIRROR_X: "1",
      GLOG_minloglevel: process.env.GLOG_minloglevel ?? "2",
      TF_CPP_MIN_LOG_LEVEL: process.env.TF_CPP_MIN_LOG_LEVEL ?? "2",
    },
    stdio: ["pipe", "pipe", "pipe", "pipe"],
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
  captureState = defaultCaptureState;
  debugRecordingState = {
    ...debugRecordingState,
    recording: false,
  };

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

  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
  } else {
    if (!existsSync(rendererIndexPath)) {
      throw new Error(`Renderer build missing at ${rendererIndexPath}`);
    }

    await mainWindow.loadFile(rendererIndexPath);
  }
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
  ipcMain.handle("airloom:set-input-suppressed", (_event, suppressed: boolean) => {
    runtime.setInputSuppressed(suppressed);
    broadcastStatus();
    return getServiceStatus();
  });
  ipcMain.handle("airloom:set-capture-label", (_event, label: string) => {
    sendServiceCommand({ type: "capture.set-label", label });
    return getServiceStatus();
  });
  ipcMain.handle("airloom:start-capture", () => {
    sendServiceCommand({ type: "capture.start" });
    return getServiceStatus();
  });
  ipcMain.handle("airloom:stop-capture", () => {
    sendServiceCommand({ type: "capture.stop" });
    return getServiceStatus();
  });
  ipcMain.handle("airloom:discard-last-capture", () => {
    sendServiceCommand({ type: "capture.discard-last" });
    return getServiceStatus();
  });
  ipcMain.handle("airloom:export-captures", () => {
    sendServiceCommand({ type: "capture.export" });
    return getServiceStatus();
  });
  ipcMain.handle("airloom:start-debug-recording", () => startDebugRecording());
  ipcMain.handle("airloom:stop-debug-recording", () => stopDebugRecording());
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
