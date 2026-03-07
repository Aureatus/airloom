import { z } from "zod";

export const pointerObservedEventSchema = z.object({
  type: z.literal("pointer.observed"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const gestureIntentEventSchema = z.object({
  type: z.literal("gesture.intent"),
  gesture: z.string().min(1),
  phase: z.enum(["start", "end", "instant"]),
});

export const statusEventSchema = z.object({
  type: z.literal("status"),
  tracking: z.boolean(),
  pinchStrength: z.number().min(0).max(1),
  gesture: z.string(),
});

export const inputEventSchema = z.discriminatedUnion("type", [
  pointerObservedEventSchema,
  gestureIntentEventSchema,
  statusEventSchema,
]);

export const pointerMoveActionSchema = z.object({
  type: z.literal("pointer.move"),
  x: z.number(),
  y: z.number(),
});

export const pointerDownActionSchema = z.object({
  type: z.literal("pointer.down"),
  button: z.enum(["left", "right"]),
});

export const pointerUpActionSchema = z.object({
  type: z.literal("pointer.up"),
  button: z.enum(["left", "right"]),
});

export const clickActionSchema = z.object({
  type: z.literal("click"),
  button: z.enum(["left", "right"]),
});

export const keyTapActionSchema = z.object({
  type: z.literal("key.tap"),
  key: z.string().min(1),
});

export const actionEventSchema = z.discriminatedUnion("type", [
  pointerMoveActionSchema,
  pointerDownActionSchema,
  pointerUpActionSchema,
  clickActionSchema,
  keyTapActionSchema,
]);

export type AirloomInputEvent = z.infer<typeof inputEventSchema>;
export type AirloomActionEvent = z.infer<typeof actionEventSchema>;
export type AirloomStatusEvent = z.infer<typeof statusEventSchema>;

export const parseInputEvent = (value: unknown): AirloomInputEvent => {
  return inputEventSchema.parse(value);
};

export const parseActionEvent = (value: unknown): AirloomActionEvent => {
  return actionEventSchema.parse(value);
};
