import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type JUnitTestCase = {
  name: string;
  timeSeconds: number;
  failureMessage?: string;
  systemOut?: string;
};

export type JUnitTestSuite = {
  name: string;
  testCases: JUnitTestCase[];
};

const escapeXml = (value: string) => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};

export const writeJUnitReport = (filePath: string, suite: JUnitTestSuite) => {
  const failures = suite.testCases.filter(
    (testCase) => testCase.failureMessage,
  ).length;
  const totalTimeSeconds = suite.testCases
    .reduce((sum, testCase) => sum + testCase.timeSeconds, 0)
    .toFixed(3);

  const body = suite.testCases
    .map((testCase) => {
      const lines = [
        `<testcase name="${escapeXml(testCase.name)}" time="${testCase.timeSeconds.toFixed(3)}">`,
      ];

      if (testCase.failureMessage) {
        lines.push(
          `<failure message="${escapeXml(testCase.failureMessage)}">${escapeXml(testCase.failureMessage)}</failure>`,
        );
      }

      if (testCase.systemOut) {
        lines.push(`<system-out>${escapeXml(testCase.systemOut)}</system-out>`);
      }

      lines.push("</testcase>");
      return lines.join("");
    })
    .join("");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${escapeXml(suite.name)}" tests="${suite.testCases.length}" failures="${failures}" time="${totalTimeSeconds}">`,
    body,
    "</testsuite>",
    "",
  ].join("");

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, xml);
};
