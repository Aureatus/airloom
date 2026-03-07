import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const reportsDir = resolve(rootDir, "reports/junit");

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

rmSync(reportsDir, { recursive: true, force: true });
mkdirSync(reportsDir, { recursive: true });

run("uv", [
  "run",
  "--directory",
  "apps/vision-service",
  "pytest",
  `--junitxml=${resolve(reportsDir, "pytest.xml")}`,
]);
run("xvfb-run", [
  "-a",
  "bun",
  "scripts/x11-smoke.ts",
  "--junit",
  resolve(reportsDir, "x11-smoke.xml"),
]);
run("xvfb-run", [
  "-a",
  "bun",
  "scripts/pipeline-smoke.ts",
  "--junit",
  resolve(reportsDir, "pipeline-smoke.xml"),
]);

console.log(`JUnit reports written to ${reportsDir}`);
