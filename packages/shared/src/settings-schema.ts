import { z } from "zod";

export const keybindMappingSchema = z.object({
  gesture: z.string().min(1),
  key: z.string().min(1),
});

export const settingsSchema = z.object({
  smoothing: z.number().min(0).max(1).default(0.35),
  clickPinchThreshold: z.number().min(0).max(1).default(0.78),
  dragHoldThresholdMs: z.number().int().min(0).max(2000).default(220),
  rightClickGesture: z.string().default("thumb-middle-pinch"),
  keyMappings: z
    .array(keybindMappingSchema)
    .default([{ gesture: "open-palm-hold", key: "Return" }]),
});

export type AirloomSettings = z.infer<typeof settingsSchema>;

export const parseAirloomSettings = (value: unknown): AirloomSettings => {
  return settingsSchema.parse(value);
};
