import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AirloomSettings,
  parseAirloomSettings,
  settingsSchema,
} from "@airloom/shared/settings-schema";
import { app } from "electron";

const defaultSettings = settingsSchema.parse({});

const getSettingsPath = () => {
  return join(app.getPath("userData"), "settings.json");
};

export const loadSettings = async (): Promise<AirloomSettings> => {
  const settingsPath = getSettingsPath();

  try {
    const content = await readFile(settingsPath, "utf8");
    return parseAirloomSettings(JSON.parse(content));
  } catch {
    await saveSettings(defaultSettings);
    return defaultSettings;
  }
};

export const saveSettings = async (
  value: AirloomSettings,
): Promise<AirloomSettings> => {
  const settingsPath = getSettingsPath();
  const nextSettings = parseAirloomSettings(value);

  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(nextSettings, null, 2));

  return nextSettings;
};
