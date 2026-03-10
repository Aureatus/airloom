import { constants, mkdirSync } from "node:fs";
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";

export const PRODUCT_NAME = "Incantation";
export const APP_NAMESPACE = "incantation";
export const LEGACY_APP_NAMESPACE = "airloom";
export const APP_ID = "dev.incantation.desktop";
export const LEGACY_APP_ID = "dev.airloom.desktop";

const MIGRATION_MARKER = ".migrated-from-airloom";

const pathExists = async (value: string) => {
  try {
    await access(value, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const getIncantationUserDataPath = () => {
  return join(app.getPath("appData"), "@incantation", "desktop");
};

export const getLegacyAirloomUserDataPath = () => {
  return join(app.getPath("appData"), "@airloom", "desktop");
};

export const ensureUserDataPath = async () => {
  const userDataPath = getIncantationUserDataPath();
  const legacyUserDataPath = getLegacyAirloomUserDataPath();

  app.setPath("userData", userDataPath);
  app.setName(PRODUCT_NAME);

  const [hasNewPath, hasLegacyPath] = await Promise.all([
    pathExists(userDataPath),
    pathExists(legacyUserDataPath),
  ]);

  if (!hasLegacyPath) {
    await mkdir(userDataPath, { recursive: true });
    return userDataPath;
  }

  const migrationMarkerPath = join(userDataPath, MIGRATION_MARKER);
  const migrationAlreadyMarked = await pathExists(migrationMarkerPath);
  if (!hasNewPath || !migrationAlreadyMarked) {
    await mkdir(userDataPath, { recursive: true });
    await cp(legacyUserDataPath, userDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    await writeFile(
      migrationMarkerPath,
      `${new Date().toISOString()}\n`,
      "utf8",
    );
  }

  return userDataPath;
};

export const primeUserDataPath = () => {
  const userDataPath = getIncantationUserDataPath();
  const legacyUserDataPath = getLegacyAirloomUserDataPath();
  app.setPath("userData", userDataPath);
  app.setName(PRODUCT_NAME);
  mkdirSync(userDataPath, { recursive: true });
  mkdirSync(legacyUserDataPath, { recursive: true });
  return userDataPath;
};

export const readEnv = (name: string, legacyName: string) => {
  return process.env[name] ?? process.env[legacyName];
};
