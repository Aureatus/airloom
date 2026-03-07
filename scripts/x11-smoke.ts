import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
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

    await new Promise((resolve) => setTimeout(resolve, 150));
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

const readEvents = (logPath: string) => {
  try {
    return JSON.parse(readFileSync(logPath, "utf8")) as string[];
  } catch {
    return [];
  }
};

const main = async () => {
  if (!process.env.DISPLAY) {
    throw new Error(
      "DISPLAY is not set. Run the smoke harness inside an X11 session.",
    );
  }

  const xdotoolPath = requireCommand("xdotool");
  if (!xdotoolPath) {
    throw new Error("xdotool is required for the X11 smoke harness.");
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "airloom-x11-smoke-"));
  const logPath = join(tempRoot, "target-log.json");
  const fixturePath = join(tempRoot, "fixture.json");
  const targetTitle = "Airloom X11 Smoke Target";
  const rootDir = join(import.meta.dirname, "..");
  const electronBinary = join(rootDir, "node_modules/.bin/electron");

  const targetProcess = spawn(
    "python3",
    [join(rootDir, "scripts/x11-smoke-target.py"), "--log", logPath],
    {
      cwd: rootDir,
      stdio: "ignore",
    },
  );

  let electronProcess: ReturnType<typeof spawn> | null = null;

  try {
    const windowId = await waitForWindow(targetTitle);
    runCommand("xdotool", ["windowmove", windowId, "180", "180"]);
    runCommand("xdotool", ["windowsize", windowId, "480", "320"]);
    runCommand("xdotool", ["windowactivate", windowId]);

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
        pinch_strength: 0.82,
        secondary_pinch_strength: 0.1,
        open_palm_hold: false,
        confidence: 0.95,
      },
      {
        tracking: true,
        pointer: { x: pointerX, y: pointerY },
        pinch_strength: 0.2,
        secondary_pinch_strength: 0.1,
        open_palm_hold: false,
        confidence: 0.95,
      },
      {
        tracking: true,
        pointer: { x: pointerX, y: pointerY },
        pinch_strength: 0.2,
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

    runCommand("bun", ["run", "--cwd", "apps/desktop", "build"], rootDir);

    electronProcess = spawn(electronBinary, ["apps/desktop"], {
      cwd: rootDir,
      env: {
        ...process.env,
        AIRLOOM_FIXTURE: fixturePath,
      },
      stdio: "ignore",
    });

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const events = readEvents(logPath);
      if (
        events.includes("left-click") &&
        events.includes("right-click") &&
        events.includes("return")
      ) {
        console.log("Airloom X11 smoke harness passed.");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error(
      `Smoke harness timed out. Observed events: ${readEvents(logPath).join(", ")}`,
    );
  } finally {
    electronProcess?.kill();
    targetProcess.kill();
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
