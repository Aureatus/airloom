import { z } from "zod";

export const pointerMoveEventSchema = z.object({
  type: z.literal("pointer.move"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const pointerDownEventSchema = z.object({
  type: z.literal("pointer.down"),
  button: z.enum(["left", "right"]),
});

export const pointerUpEventSchema = z.object({
  type: z.literal("pointer.up"),
  button: z.enum(["left", "right"]),
});

export const clickEventSchema = z.object({
  type: z.literal("click"),
  button: z.enum(["left", "right"]),
});

export const keyTapEventSchema = z.object({
  type: z.literal("key.tap"),
  key: z.string().min(1),
});

export const gestureTriggerEventSchema = z.object({
  type: z.literal("gesture.trigger"),
  gesture: z.string().min(1),
});

export const statusEventSchema = z.object({
  type: z.literal("status"),
  tracking: z.boolean(),
  pinchStrength: z.number().min(0).max(1),
  gesture: z.string(),
});

export const gestureEventSchema = z.discriminatedUnion("type", [
  pointerMoveEventSchema,
  pointerDownEventSchema,
  pointerUpEventSchema,
  clickEventSchema,
  keyTapEventSchema,
  gestureTriggerEventSchema,
  statusEventSchema,
]);

export type GestureEvent = z.infer<typeof gestureEventSchema>;

export const parseGestureEvent = (value: unknown): GestureEvent => {
  return gestureEventSchema.parse(value);
};
