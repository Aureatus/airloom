import { mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";

export const PRODUCT_NAME = "Incantation";
export const APP_NAMESPACE = "airloom";
export const APP_ID = "dev.airloom.desktop";

export const getAirloomUserDataPath = () => {
  return join(app.getPath("appData"), "@airloom", "desktop");
};

export const ensureAirloomUserDataPath = async () => {
  const userDataPath = getAirloomUserDataPath();
  app.setPath("userData", userDataPath);
  app.setName(PRODUCT_NAME);
  await mkdir(userDataPath, { recursive: true });
  return userDataPath;
};

export const primeAirloomUserDataPath = () => {
  const userDataPath = getAirloomUserDataPath();
  app.setPath("userData", userDataPath);
  app.setName(PRODUCT_NAME);
  mkdirSync(userDataPath, { recursive: true });
  return userDataPath;
};

export const readAirloomEnv = (name: string) => process.env[name];
