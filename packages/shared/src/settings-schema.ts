import { z } from "zod";

export const keybindMappingSchema = z.object({
  gesture: z.string().min(1),
  key: z.string().min(1),
});

export const commandHudPositionSchema = z.enum([
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
]);

export const settingsSchema = z.object({
  smoothing: z.number().min(0).max(1).default(0.5),
  pointerRegionMargin: z.number().min(0).max(0.35).default(0.12),
  clickPinchThreshold: z.number().min(0).max(1).default(0.78),
  dragHoldThresholdMs: z.number().int().min(0).max(2000).default(220),
  rightClickGesture: z.string().default("thumb-middle-pinch"),
  workspacePreviousKey: z.string().default(""),
  workspaceNextKey: z.string().default(""),
  commandHudPosition: commandHudPositionSchema.default("top-right"),
  cameraHudPosition: commandHudPositionSchema.default("top-left"),
  commandModeRightClickDeadzone: z.number().min(0).max(0.2).default(0.04),
  commandModeScrollDeadzone: z.number().min(0).max(0.3).default(0.05),
  commandModeScrollFastThreshold: z.number().min(0.05).max(0.4).default(0.14),
  commandModeScrollGain: z.number().min(1).max(200).default(32),
  commandModeWorkspaceThreshold: z.number().min(0.01).max(0.5).default(0.08),
  commandModeWorkspaceStep: z.number().min(0.01).max(0.5).default(0.12),
  pushToTalkGesture: z.string().default("peace-sign"),
  pushToTalkKey: z.string().default("Ctrl+Space"),
  keyMappings: z
    .array(keybindMappingSchema)
    .default([{ gesture: "open-palm-hold", key: "Return" }]),
});

export type AirloomSettings = z.infer<typeof settingsSchema>;

export const parseAirloomSettings = (value: unknown): AirloomSettings => {
  return settingsSchema.parse(value);
};
