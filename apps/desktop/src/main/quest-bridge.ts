import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import type { AirloomSettings } from "@incantation/shared/settings-schema";

export type QuestBridgeInfo = {
  enabled: boolean;
  port: number;
  recommendedUrl: string | null;
  recommendedAddress: string | null;
  candidateUrls: string[];
  desktopSelfTestUrl: string;
  desktopSelfTestAddress: string;
  smokeTestCommand: string;
  httpsReady: boolean;
  certificateMode: "manual" | "auto" | "none";
  warnings: string[];
};

type QuestTlsMaterial = {
  certPath: string;
  keyPath: string;
  mode: "manual" | "auto";
};

const questBridgeDirName = "quest-bridge";
const questBridgeCertName = "bridge-cert.pem";
const questBridgeKeyName = "bridge-key.pem";

const hostWeight = (name: string) => {
  if (/^(wlan|wifi|wl)/i.test(name)) {
    return 0;
  }
  if (/^(eth|en)/i.test(name)) {
    return 1;
  }
  if (/^(tailscale|zt|tun|tap|utun|docker|br-|virbr|veth)/i.test(name)) {
    return 5;
  }
  return 3;
};

const isPrivateIpv4 = (address: string) => {
  if (address.startsWith("10.")) {
    return true;
  }
  if (address.startsWith("192.168.")) {
    return true;
  }
  const octets = address.split(".");
  if (octets.length < 2) {
    return false;
  }
  const first = Number(octets[0]);
  const second = Number(octets[1]);
  return first === 172 && second >= 16 && second <= 31;
};

const listCandidateHosts = () => {
  const interfaces = networkInterfaces();
  const candidates = Object.entries(interfaces)
    .flatMap(([name, entries]) =>
      (entries ?? [])
        .filter(
          (entry) =>
            entry.family === "IPv4" &&
            !entry.internal &&
            !entry.address.startsWith("169.254."),
        )
        .map((entry) => ({ name, address: entry.address })),
    )
    .filter((entry) => isPrivateIpv4(entry.address));

  const unique = new Map<string, { name: string; address: string }>();
  for (const candidate of candidates) {
    unique.set(candidate.address, candidate);
  }

  return [...unique.values()].sort((left, right) => {
    const weightDelta = hostWeight(left.name) - hostWeight(right.name);
    if (weightDelta !== 0) {
      return weightDelta;
    }
    return left.address.localeCompare(right.address);
  });
};

const commandExists = (command: string) => {
  const result = spawnSync(command, ["version"], {
    stdio: "ignore",
  });
  return result.status === 0;
};

const getAutoTlsPaths = (userDataPath: string) => {
  const directory = join(userDataPath, questBridgeDirName);
  return {
    directory,
    certPath: join(directory, questBridgeCertName),
    keyPath: join(directory, questBridgeKeyName),
  };
};

const getQuestTlsMaterial = (userDataPath: string): QuestTlsMaterial | null => {
  const manualCertPath =
    process.env.INCANTATION_QUEST_TLS_CERT ??
    process.env.AIRLOOM_QUEST_TLS_CERT;
  const manualKeyPath =
    process.env.INCANTATION_QUEST_TLS_KEY ?? process.env.AIRLOOM_QUEST_TLS_KEY;
  if (
    manualCertPath &&
    manualKeyPath &&
    existsSync(manualCertPath) &&
    existsSync(manualKeyPath)
  ) {
    return {
      certPath: manualCertPath,
      keyPath: manualKeyPath,
      mode: "manual",
    };
  }

  const autoPaths = getAutoTlsPaths(userDataPath);
  if (existsSync(autoPaths.certPath) && existsSync(autoPaths.keyPath)) {
    return {
      certPath: autoPaths.certPath,
      keyPath: autoPaths.keyPath,
      mode: "auto",
    };
  }

  return null;
};

const buildUrls = (scheme: "http" | "https", port: number, hosts: string[]) => {
  return hosts.map((host) => `${scheme}://${host}:${port}/`);
};

const toAddressLabel = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return value;
  }
};

export const getQuestBridgeInfo = (
  settings: AirloomSettings,
  userDataPath: string,
): QuestBridgeInfo => {
  const enabled = settings.trackingBackend === "quest-bridge";
  const port = settings.questBridgePort;
  const tlsMaterial = getQuestTlsMaterial(userDataPath);
  const opensslAvailable = commandExists("openssl");
  const httpsReady = tlsMaterial !== null || opensslAvailable;
  const scheme = httpsReady ? "https" : "http";
  const candidateHosts = listCandidateHosts();
  const candidateUrls = buildUrls(
    scheme,
    port,
    candidateHosts.map((candidate) => candidate.address),
  );
  const recommendedUrl = candidateUrls[0] ?? null;
  const desktopSelfTestUrl = `${scheme}://127.0.0.1:${port}/`;
  const recommendedAddress = toAddressLabel(recommendedUrl);
  const desktopSelfTestAddress =
    toAddressLabel(desktopSelfTestUrl) ?? `127.0.0.1:${port}`;
  const warnings: string[] = [];

  if (enabled && candidateUrls.length === 0) {
    warnings.push(
      "No private LAN IP was detected. Quest testing will be hard until the laptop has a normal Wi-Fi or Ethernet address.",
    );
  }

  if (enabled && !httpsReady) {
    warnings.push(
      "HTTPS is not ready for Quest Bridge. Install openssl or provide INCANTATION_QUEST_TLS_CERT and INCANTATION_QUEST_TLS_KEY before testing WebXR hand tracking in Quest Browser.",
    );
  } else if (enabled && tlsMaterial === null) {
    warnings.push(
      "Incantation will generate a local self-signed HTTPS certificate automatically when you start the Quest Bridge service.",
    );
  } else if (enabled && tlsMaterial.mode === "auto") {
    warnings.push(
      "Quest Bridge uses a local self-signed HTTPS certificate. On first load, Quest Browser may ask you to continue past a certificate warning.",
    );
  }

  return {
    enabled,
    port,
    recommendedUrl,
    recommendedAddress,
    candidateUrls,
    desktopSelfTestUrl,
    desktopSelfTestAddress,
    smokeTestCommand: `bun run test:quest -- --url ${desktopSelfTestUrl}`,
    httpsReady,
    certificateMode: tlsMaterial?.mode ?? "none",
    warnings,
  };
};

export const prepareQuestBridgeTls = (
  settings: AirloomSettings,
  userDataPath: string,
): QuestTlsMaterial | null => {
  if (settings.trackingBackend !== "quest-bridge") {
    return null;
  }

  const existing = getQuestTlsMaterial(userDataPath);
  if (existing !== null) {
    return existing;
  }

  if (!commandExists("openssl")) {
    return null;
  }

  const autoPaths = getAutoTlsPaths(userDataPath);
  mkdirSync(autoPaths.directory, { recursive: true });

  const sans = [
    "DNS:localhost",
    "IP:127.0.0.1",
    ...listCandidateHosts().map((candidate) => `IP:${candidate.address}`),
  ];

  const result = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-nodes",
      "-days",
      "365",
      "-subj",
      "/CN=incantation-quest-bridge",
      "-addext",
      `subjectAltName=${sans.join(",")}`,
      "-keyout",
      autoPaths.keyPath,
      "-out",
      autoPaths.certPath,
    ],
    {
      stdio: "ignore",
    },
  );

  if (result.status !== 0) {
    return null;
  }

  return {
    certPath: autoPaths.certPath,
    keyPath: autoPaths.keyPath,
    mode: "auto",
  };
};
