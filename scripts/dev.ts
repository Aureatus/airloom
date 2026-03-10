import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import chokidar from "chokidar";

const rootDir = resolve(import.meta.dirname, "..");
const desktopDir = resolve(rootDir, "apps/desktop");
const viteHost = "127.0.0.1";
const vitePort = Number(
  process.env.AIRLOOM_DEV_PORT ?? process.env.AIRLOOM_DEV_PORT ?? "5173",
);
const viteReadyPattern = /(https?:\/\/[\w.:-]+)/;

const run = (command: string, args: string[], cwd = rootDir) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
};

const startProcess = (
  command: string,
  args: string[],
  cwd = rootDir,
  overrides: Partial<Parameters<typeof spawn>[2]> = {},
) => {
  return spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    ...overrides,
  });
};

let electronProcess: ChildProcess | null = null;
let viteProcess: ChildProcess | null = null;
let restarting = false;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let restartChain = Promise.resolve();

const buildDesktopRuntime = () => {
  run("bun", ["run", "--cwd", "packages/shared", "build"]);
  run("bun", ["run", "--cwd", "apps/desktop", "build:main"]);
};

const pipeOutput = (child: ChildProcess, label: string) => {
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk.toString()}`);
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk.toString()}`);
  });
};

const waitForVite = async () => {
  const existingUrl = `http://${viteHost}:${vitePort}`;
  let resolveUrl: ((url: string) => void) | null = null;
  let rejectUrl: ((error: Error) => void) | null = null;

  const ready = new Promise<string>((resolvePromise, rejectPromise) => {
    resolveUrl = resolvePromise;
    rejectUrl = rejectPromise;
  });

  viteProcess = startProcess(
    "bunx",
    ["vite", "--host", viteHost, "--port", String(vitePort), "--strictPort"],
    desktopDir,
    {
      stdio: ["inherit", "pipe", "pipe"],
    },
  );

  let resolved = false;
  const onLine = (chunk: Buffer | string) => {
    const text = chunk.toString();
    process.stdout.write(`[vite] ${text}`);

    if (resolved) {
      return;
    }

    const match = text.match(viteReadyPattern);
    if (!match) {
      return;
    }

    resolved = true;
    resolveUrl?.(match[1].replace(/\/$/, ""));
  };

  viteProcess.stdout?.on("data", onLine);
  viteProcess.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    process.stderr.write(`[vite] ${text}`);

    if (resolved) {
      return;
    }

    if (text.includes("Port") && text.includes("is already in use")) {
      resolved = true;
      rejectUrl?.(
        new Error(
          `Vite could not start on ${existingUrl}. Set AIRLOOM_DEV_PORT (or legacy AIRLOOM_DEV_PORT) to another port or stop the process already using it.`,
        ),
      );
    }
  });

  viteProcess.once("exit", (code) => {
    if (resolved) {
      return;
    }

    resolved = true;
    rejectUrl?.(
      new Error(`Vite exited before it was ready (code ${code ?? "unknown"}).`),
    );
  });

  return ready;
};

const startElectron = (rendererUrl: string) => {
  electronProcess = spawn("bunx", ["electron", "."], {
    cwd: desktopDir,
    stdio: ["inherit", "pipe", "pipe"],
    env: {
      ...process.env,
      AIRLOOM_RENDERER_URL: rendererUrl,
    },
  });

  pipeOutput(electronProcess, "electron");

  electronProcess.on("exit", () => {
    if (restarting) {
      return;
    }

    process.exit(0);
  });
};

const restartElectron = async (rendererUrl: string) => {
  restarting = true;
  if (electronProcess !== null && electronProcess.exitCode === null) {
    electronProcess.kill();
    await new Promise((resolvePromise) => {
      electronProcess?.once("exit", resolvePromise);
    });
  }

  startElectron(rendererUrl);
  restarting = false;
};

const queueRestart = (action: () => Promise<void>) => {
  if (rebuildTimer !== null) {
    clearTimeout(rebuildTimer);
  }

  rebuildTimer = setTimeout(() => {
    restartChain = restartChain.then(action).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, 120);
};

const queueRuntimeRestart = (rendererUrl: string) => {
  queueRestart(async () => {
    buildDesktopRuntime();
    await restartElectron(rendererUrl);
  });
};

const queueElectronRestart = (rendererUrl: string) => {
  queueRestart(async () => {
    await restartElectron(rendererUrl);
  });
};

let runtimeWatcher: chokidar.FSWatcher | null = null;
let pythonWatcher: chokidar.FSWatcher | null = null;

const shutdown = () => {
  runtimeWatcher?.close().catch(() => {});
  pythonWatcher?.close().catch(() => {});
  viteProcess?.kill();
  electronProcess?.kill();
  process.exit(0);
};

const main = async () => {
  buildDesktopRuntime();
  const rendererUrl = await waitForVite();
  startElectron(rendererUrl);

  runtimeWatcher = chokidar.watch(
    [
      resolve(rootDir, "packages/shared/src/**/*.{ts,tsx}"),
      resolve(rootDir, "apps/desktop/src/main/**/*.ts"),
      resolve(rootDir, "apps/desktop/src/preload/**/*.ts"),
    ],
    { ignoreInitial: true },
  );

  pythonWatcher = chokidar.watch(
    [resolve(rootDir, "apps/vision-service/app/**/*.py")],
    { ignoreInitial: true },
  );

  runtimeWatcher.on("all", () => {
    queueRuntimeRestart(rendererUrl);
  });
  pythonWatcher.on("all", () => {
    queueElectronRestart(rendererUrl);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  console.error(error);
  shutdown();
});
process.on("unhandledRejection", (error) => {
  console.error(error);
  shutdown();
});

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown();
});
