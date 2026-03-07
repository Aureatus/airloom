import type {
  AirloomActionEvent,
  AirloomInputEvent,
} from "@airloom/shared/gesture-events";
import type { AirloomSettings } from "@airloom/shared/settings-schema";

type GetSettings = () => AirloomSettings;
type NormalizePosition = (x: number, y: number) => { x: number; y: number };
type Now = () => number;

export type ActionMapperDebugState = {
  primaryPinchActive: boolean;
  primaryPinchHeldMs: number;
  primaryPinchOutcome: "idle" | "click" | "drag";
};

export const createActionMapper = (
  getSettings: GetSettings,
  normalizePosition: NormalizePosition,
  now: Now = () => Date.now(),
) => {
  let primaryPinchStartedAt: number | null = null;

  const getDebugState = (): ActionMapperDebugState => {
    const settings = getSettings();

    if (primaryPinchStartedAt === null) {
      return {
        primaryPinchActive: false,
        primaryPinchHeldMs: 0,
        primaryPinchOutcome: "idle",
      };
    }

    const heldMs = Math.max(0, now() - primaryPinchStartedAt);

    return {
      primaryPinchActive: true,
      primaryPinchHeldMs: heldMs,
      primaryPinchOutcome:
        heldMs <= settings.dragHoldThresholdMs ? "click" : "drag",
    };
  };

  const mapEvent = (event: AirloomInputEvent): AirloomActionEvent[] => {
    switch (event.type) {
      case "pointer.observed": {
        return [
          {
            type: "pointer.move",
            ...normalizePosition(event.x, event.y),
          },
        ];
      }

      case "gesture.intent": {
        const settings = getSettings();

        if (event.gesture === "primary-pinch" && event.phase === "start") {
          primaryPinchStartedAt = now();
          return [{ type: "pointer.down", button: "left" }];
        }

        if (event.gesture === "primary-pinch" && event.phase === "end") {
          const heldForMs =
            primaryPinchStartedAt === null
              ? settings.dragHoldThresholdMs + 1
              : now() - primaryPinchStartedAt;
          primaryPinchStartedAt = null;

          return heldForMs <= settings.dragHoldThresholdMs
            ? [
                { type: "pointer.up", button: "left" },
                { type: "click", button: "left" },
              ]
            : [{ type: "pointer.up", button: "left" }];
        }

        if (
          event.gesture === settings.rightClickGesture &&
          event.phase === "instant"
        ) {
          return [{ type: "click", button: "right" }];
        }

        const mapping = settings.keyMappings.find(
          (entry) => entry.gesture === event.gesture,
        );

        if (mapping && event.phase === "instant") {
          return [{ type: "key.tap", key: mapping.key }];
        }

        return [];
      }

      case "status": {
        return [];
      }
    }
  };

  return {
    getDebugState,
    mapEvent,
  };
};
