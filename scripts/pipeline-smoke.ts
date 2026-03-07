import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const wait = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const runCommand = (command: string, args: string[], cwd?: string) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `Command failed: ${command}`,
    );
  }

  return result.stdout.trim();
};

const requireCommand = (command: string) => {
  const result = spawnSync(
    "python3",
    ["-c", `import shutil; print(shutil.which('${command}') or '')`],
    {
      encoding: "utf8",
    },
  );

  return result.stdout.trim();
};

const waitForWindow = async (windowName: string) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = spawnSync("xdotool", ["search", "--name", windowName], {
      encoding: "utf8",
    });

    if (result.status === 0) {
      return result.stdout.trim().split("\n")[0];
    }

    await wait(150);
  }

  throw new Error(`Unable to find X11 window named ${windowName}`);
};

const parseShellGeometry = (shellOutput: string): Geometry => {
  const values = Object.fromEntries(
    shellOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, value] = line.split("=");
        return [key, Number(value)];
      }),
  );

  return {
    x: values.X,
    y: values.Y,
    width: values.WIDTH,
    height: values.HEIGHT,
  };
};

const parseObservedEvents = (output: string) => {
  const events: string[] = [];

  if (output.includes("button 1,")) {
    events.push("left-click");
  }

  if (output.includes("button 3,")) {
    events.push("right-click");
  }

  if (output.includes("keysym 0xff0d, Return")) {
    events.push("return");
  }

  return events;
};

const main = async () => {
  if (!process.env.DISPLAY) {
    throw new Error(
      "DISPLAY is not set. Run the smoke harness inside an X11 session.",
    );
  }

  if (!requireCommand("xdotool")) {
    throw new Error("xdotool is required for the pipeline smoke harness.");
  }

  if (!requireCommand("xev")) {
    throw new Error("xev is required for the pipeline smoke harness.");
  }

  const rootDir = join(import.meta.dirname, "..");
  const electronBinary = join(
    rootDir,
    "apps/desktop/node_modules/.bin/electron",
  );
  const tempRoot = mkdtempSync(join(tmpdir(), "airloom-pipeline-smoke-"));
  const fixturePath = join(tempRoot, "frame-fixture.json");
  const targetTitle = "Airloom Pipeline Smoke Target";

  const targetProcess = spawn(
    "xev",
    ["-name", targetTitle, "-geometry", "480x320+180+180"],
    {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let targetOutput = "";
  targetProcess.stdout.on("data", (chunk) => {
    targetOutput += chunk.toString();
  });

  let desktopOutput = "";
  let desktopError = "";
  let desktopProcess: ReturnType<typeof spawn> | null = null;

  try {
    const windowId = await waitForWindow(targetTitle);
    runCommand("xdotool", ["windowmove", windowId, "180", "180"]);
    runCommand("xdotool", ["windowsize", windowId, "480", "320"]);
    runCommand("xdotool", ["windowfocus", "--sync", windowId]);

    const geometry = parseShellGeometry(
      runCommand("xdotool", ["getwindowgeometry", "--shell", windowId]),
    );
    const [screenWidth, screenHeight] = runCommand("xdotool", [
      "getdisplaygeometry",
    ])
      .split(" ")
      .map(Number);

    const pointerX = (geometry.x + geometry.width / 2) / screenWidth;
    const pointerY = (geometry.y + geometry.height / 2) / screenHeight;

    const fixture = [
      {
        tracking: true,
        pointer: { x: pointerX, y: pointerY },
        pinch_strength: 0.1,
        secondary_pinch_strength: 0.1,
        open_palm_hold: false,
        confidence: 0.95,
      },
      {
        tracking: true,
        pointer: { x: pointerX, y: pointerY },
        pinch_strength: 0.81,
        secondary_pinch_strength: 0.1,
        open_palm_hold: false,
        confidence: 0.95,
      },
      {
        tracking: true,
        pointer: { x: pointerX, y: pointerY },
        pinch_strength: 0.32,
        secondary_pinch_strength: 0.1,
        open_palm_hold: false,
        confidence: 0.95,
      },
      {
        tracking: true,
        pointer: { x: pointerX, y: pointerY },
        pinch_strength: 0.1,
        secondary_pinch_strength: 0.84,
        open_palm_hold: false,
        confidence: 0.95,
      },
      ...Array.from({ length: 12 }, () => ({
        tracking: true,
        pointer: { x: pointerX, y: pointerY },
        pinch_strength: 0.1,
        secondary_pinch_strength: 0.1,
        open_palm_hold: true,
        confidence: 0.95,
      })),
    ];

    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

    runCommand("bun", ["run", "build"], rootDir);

    desktopProcess = spawn(electronBinary, ["apps/desktop"], {
      cwd: rootDir,
      env: {
        ...process.env,
        AIRLOOM_HEADLESS: "1",
        AIRLOOM_STARTUP_DELAY_MS: "500",
        AIRLOOM_FIXTURE: fixturePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    desktopProcess.stdout.on("data", (chunk) => {
      desktopOutput += chunk.toString();
    });
    desktopProcess.stderr.on("data", (chunk) => {
      desktopError += chunk.toString();
    });

    await wait(200);
    runCommand("xdotool", ["windowfocus", "--sync", windowId]);

    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (targetProcess.exitCode !== null) {
        throw new Error(
          "xev exited before the pipeline smoke harness completed.",
        );
      }

      const events = parseObservedEvents(targetOutput);
      if (
        events.includes("left-click") &&
        events.includes("right-click") &&
        events.includes("return")
      ) {
        console.log("Airloom pipeline smoke harness passed.");
        return;
      }

      await wait(100);
    }

    throw new Error(
      `Pipeline smoke timed out. Observed events: ${parseObservedEvents(targetOutput).join(", ")}\n${desktopError || desktopOutput}`,
    );
  } finally {
    desktopProcess?.kill();
    targetProcess.kill();
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
