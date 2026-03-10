import { spawn, spawnSync } from "node:child_process";
import { createLinuxX11Adapter } from "../apps/desktop/src/main/input/linux-x11";
import { writeJUnitReport } from "./lib/junit";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const runCommand = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
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

const wait = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

const getArgValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
};

const main = async () => {
  const reportPath = getArgValue("--junit");
  const startedAt = Date.now();

  if (!process.env.DISPLAY) {
    throw new Error(
      "DISPLAY is not set. Run the smoke harness inside an X11 session.",
    );
  }

  if (!requireCommand("xdotool")) {
    throw new Error("xdotool is required for the X11 smoke harness.");
  }

  if (!requireCommand("xev")) {
    throw new Error("xev is required for the X11 smoke harness.");
  }

  const adapter = createLinuxX11Adapter();
  if (!adapter.isAvailable()) {
    throw new Error("The Linux X11 adapter is not available in this session.");
  }

  const targetTitle = "Incantation X11 Smoke Target";
  const targetProcess = spawn(
    "xev",
    ["-name", targetTitle, "-geometry", "480x320+180+180"],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let targetOutput = "";
  targetProcess.stdout.on("data", (chunk) => {
    targetOutput += chunk.toString();
  });

  try {
    const windowId = await waitForWindow(targetTitle);
    runCommand("xdotool", ["windowmove", windowId, "180", "180"]);
    runCommand("xdotool", ["windowsize", windowId, "480", "320"]);
    runCommand("xdotool", ["windowfocus", "--sync", windowId]);

    const geometry = parseShellGeometry(
      runCommand("xdotool", ["getwindowgeometry", "--shell", windowId]),
    );

    await adapter.movePointer({
      x: geometry.x + Math.round(geometry.width / 2),
      y: geometry.y + Math.round(geometry.height / 2),
    });
    await wait(120);
    await adapter.click("left");
    await wait(120);
    await adapter.click("right");
    await wait(120);
    await adapter.tapKey("Return");

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (targetProcess.exitCode !== null) {
        throw new Error("xev exited before the smoke harness completed.");
      }

      const events = parseObservedEvents(targetOutput);
      if (
        events.includes("left-click") &&
        events.includes("right-click") &&
        events.includes("return")
      ) {
        if (reportPath) {
          writeJUnitReport(reportPath, {
            name: "incantation-x11-smoke",
            testCases: [
              {
                name: "adapter smoke",
                timeSeconds: (Date.now() - startedAt) / 1000,
                systemOut: `observed=${events.join(",")}`,
              },
            ],
          });
        }

        console.log("Incantation X11 smoke harness passed.");
        return;
      }

      await wait(100);
    }

    throw new Error(
      `Smoke harness timed out. Observed events: ${parseObservedEvents(targetOutput).join(", ")}`,
    );
  } finally {
    targetProcess.kill();
  }
};

main().catch((error) => {
  const reportPath = getArgValue("--junit");
  if (reportPath) {
    writeJUnitReport(reportPath, {
      name: "incantation-x11-smoke",
      testCases: [
        {
          name: "adapter smoke",
          timeSeconds: 0,
          failureMessage:
            error instanceof Error ? error.message : String(error),
        },
      ],
    });
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
