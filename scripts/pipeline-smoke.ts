import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type JUnitTestCase, writeJUnitReport } from "./lib/junit";

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PipelineScenario = {
  name: string;
  fixtureFile: string;
  expectedLabel: string;
  assert: (summary: {
    leftPresses: number;
    rightPresses: number;
    returns: number;
  }) => boolean;
};

type FixtureDocument = {
  meta?: {
    name?: string;
    description?: string;
    expected?: string;
  };
  frames: Array<Record<string, unknown>>;
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

const parseObservedSummary = (output: string) => {
  return {
    leftPresses: (output.match(/button 1,/g) ?? []).length,
    rightPresses: (output.match(/button 3,/g) ?? []).length,
    returns: (output.match(/keysym 0xff0d, Return/g) ?? []).length,
  };
};

const loadAdjustedFixture = (
  fixturePath: string,
  pointerX: number,
  pointerY: number,
) => {
  const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as
    | FixtureDocument
    | Array<Record<string, unknown>>;
  const document = Array.isArray(raw) ? { meta: {}, frames: raw } : raw;

  return {
    meta: document.meta ?? {},
    frames: document.frames.map((frame) => ({
      ...frame,
      pointer:
        frame.pointer && typeof frame.pointer === "object"
          ? { x: pointerX, y: pointerY }
          : frame.pointer,
      action_pointer:
        frame.action_pointer && typeof frame.action_pointer === "object"
          ? { x: pointerX, y: pointerY }
          : frame.action_pointer,
    })),
  };
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
  const testCases: JUnitTestCase[] = [];

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
  const targetTitle = "Airloom Pipeline Smoke Target";
  const fixtureRoot = join(
    rootDir,
    "apps/vision-service/tests/fixtures/landmark_sequences",
  );
  const scenarios: PipelineScenario[] = [
    {
      name: "combo click right enter",
      fixtureFile: "combo-click-right-enter.json",
      expectedLabel: "left click + command right click + Return",
      assert: (summary) =>
        summary.leftPresses >= 2 &&
        summary.rightPresses >= 2 &&
        summary.returns >= 1,
    },
    {
      name: "drag release",
      fixtureFile: "drag-release.json",
      expectedLabel:
        "single drag press/release cycle without right click or Return",
      assert: (summary) =>
        summary.leftPresses === 2 &&
        summary.rightPresses === 0 &&
        summary.returns === 0,
    },
    {
      name: "enter only",
      fixtureFile: "enter-only.json",
      expectedLabel: "Return only",
      assert: (summary) =>
        summary.leftPresses === 0 &&
        summary.rightPresses === 0 &&
        summary.returns >= 1,
    },
  ];

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
    const pointerPixelX = Math.round(geometry.x + geometry.width / 2);
    const pointerPixelY = Math.round(geometry.y + geometry.height / 2);

    runCommand("bun", ["run", "build"], rootDir);

    for (const scenario of scenarios) {
      const fixturePath = join(tempRoot, scenario.fixtureFile);
      const adjustedFixture = loadAdjustedFixture(
        join(fixtureRoot, scenario.fixtureFile),
        pointerX,
        pointerY,
      );
      writeFileSync(fixturePath, JSON.stringify(adjustedFixture, null, 2));

      const outputOffset = targetOutput.length;
      desktopOutput = "";
      desktopError = "";
      const scenarioStartedAt = Date.now();
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
      runCommand("xdotool", [
        "mousemove",
        String(pointerPixelX),
        String(pointerPixelY),
      ]);

      let passed = false;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        if (targetProcess.exitCode !== null) {
          throw new Error(
            "xev exited before the pipeline smoke harness completed.",
          );
        }

        const summary = parseObservedSummary(targetOutput.slice(outputOffset));
        if (scenario.assert(summary)) {
          passed = true;
          break;
        }

        await wait(100);
      }

      desktopProcess.kill();
      desktopProcess = null;

      if (!passed) {
        const summary = parseObservedSummary(targetOutput.slice(outputOffset));
        testCases.push({
          name: adjustedFixture.meta.name ?? scenario.name,
          timeSeconds: (Date.now() - scenarioStartedAt) / 1000,
          failureMessage: `summary=${JSON.stringify(summary)} ${desktopError || desktopOutput}`,
          systemOut: [
            `description=${adjustedFixture.meta.description ?? "n/a"}`,
            `expected=${adjustedFixture.meta.expected ?? scenario.expectedLabel}`,
          ].join(" | "),
        });

        if (reportPath) {
          writeJUnitReport(reportPath, {
            name: "airloom-pipeline-smoke",
            testCases,
          });
        }

        throw new Error(
          `Pipeline smoke scenario failed: ${scenario.name}. Summary: ${JSON.stringify(summary)}\n${desktopError || desktopOutput}`,
        );
      }

      const summary = parseObservedSummary(targetOutput.slice(outputOffset));
      const elapsedMs = Date.now() - scenarioStartedAt;
      testCases.push({
        name: adjustedFixture.meta.name ?? scenario.name,
        timeSeconds: elapsedMs / 1000,
        systemOut: [
          `description=${adjustedFixture.meta.description ?? "n/a"}`,
          `expected=${adjustedFixture.meta.expected ?? scenario.expectedLabel}`,
          `observed=left:${summary.leftPresses},right:${summary.rightPresses},return:${summary.returns}`,
          `elapsed_ms=${elapsedMs}`,
        ].join(" | "),
      });
      console.log(
        [
          `scenario: ${adjustedFixture.meta.name ?? scenario.name}`,
          `description: ${adjustedFixture.meta.description ?? "n/a"}`,
          `expected: ${adjustedFixture.meta.expected ?? scenario.expectedLabel}`,
          `observed: left=${summary.leftPresses}, right=${summary.rightPresses}, return=${summary.returns}`,
          `elapsed_ms: ${elapsedMs}`,
        ].join(" | "),
      );
    }

    if (reportPath) {
      writeJUnitReport(reportPath, {
        name: "airloom-pipeline-smoke",
        testCases,
      });
    }

    console.log("Airloom pipeline smoke harness passed.");
  } finally {
    desktopProcess?.kill();
    targetProcess.kill();
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  const reportPath = getArgValue("--junit");
  if (reportPath && !existsSync(reportPath)) {
    writeJUnitReport(reportPath, {
      name: "airloom-pipeline-smoke",
      testCases: [
        {
          name: "pipeline smoke bootstrap",
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
