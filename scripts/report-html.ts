import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const junitDir = resolve(rootDir, "reports/junit");
const htmlDir = resolve(rootDir, "reports/html");
const mergedXmlPath = resolve(rootDir, "reports/html/merged.xml");
const htmlPath = resolve(rootDir, "reports/html/index.html");

const hasFlag = (flag: string) => {
  return process.argv.includes(flag);
};

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
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

const openPath = (filePath: string) => {
  const openers: Array<[string, string[]]> = [
    ["xdg-open", [filePath]],
    ["gio", ["open", filePath]],
    ["open", [filePath]],
  ];

  for (const [command, args] of openers) {
    const which = spawnSync(
      "python3",
      ["-c", `import shutil; print(shutil.which('${command}') or '')`],
      {
        encoding: "utf8",
      },
    );

    if (!which.stdout.trim()) {
      continue;
    }

    const result = spawnSync(command, args, {
      cwd: rootDir,
      stdio: "ignore",
    });

    if (result.status === 0) {
      return true;
    }
  }

  return false;
};

const xmlFiles = readdirSync(junitDir)
  .filter((entry) => entry.endsWith(".xml"))
  .map((entry) => resolve(junitDir, entry))
  .sort();

if (xmlFiles.length === 0) {
  throw new Error(
    `No JUnit XML files found in ${junitDir}. Run \`bun run test:report\` first.`,
  );
}

mkdirSync(htmlDir, { recursive: true });

if (xmlFiles.length === 1) {
  run("uvx", ["--from", "junit2html", "junit2html", xmlFiles[0], htmlPath]);
} else {
  run("uvx", [
    "--from",
    "junit2html",
    "junit2html",
    "--merge",
    mergedXmlPath,
    ...xmlFiles,
  ]);
  run("uvx", ["--from", "junit2html", "junit2html", mergedXmlPath, htmlPath]);
}

console.log(`HTML report written to ${htmlPath}`);

if (hasFlag("--open")) {
  if (openPath(htmlPath)) {
    console.log("Opened HTML report.");
  } else {
    console.log(
      "Could not auto-open the report; open it manually from the path above.",
    );
  }
}
