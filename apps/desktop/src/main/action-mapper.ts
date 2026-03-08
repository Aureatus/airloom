import type {
  AirloomActionEvent,
  AirloomInputEvent,
} from "@airloom/shared/gesture-events";
import type { AirloomSettings } from "@airloom/shared/settings-schema";

type GetSettings = () => AirloomSettings;
type NormalizePosition = (x: number, y: number) => { x: number; y: number };
type Now = () => number;

export type ActionMapperDebugState = {
  pointerControlEnabled: boolean;
  primaryPinchActive: boolean;
  primaryPinchHeldMs: number;
  primaryPinchOutcome: "idle" | "click";
};

export const createActionMapper = (
  getSettings: GetSettings,
  normalizePosition: NormalizePosition,
  now: Now = () => Date.now(),
) => {
  let primaryPinchStartedAt: number | null = null;
  let pointerControlEnabled = false;

  const getDebugState = (): ActionMapperDebugState => {
    if (primaryPinchStartedAt === null) {
      return {
        pointerControlEnabled,
        primaryPinchActive: false,
        primaryPinchHeldMs: 0,
        primaryPinchOutcome: "idle",
      };
    }

    const heldMs = Math.max(0, now() - primaryPinchStartedAt);

    return {
      pointerControlEnabled,
      primaryPinchActive: true,
      primaryPinchHeldMs: heldMs,
      primaryPinchOutcome: "click",
    };
  };

  const mapEvent = (event: AirloomInputEvent): AirloomActionEvent[] => {
    switch (event.type) {
      case "pointer.observed": {
        if (!pointerControlEnabled) {
          return [];
        }

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
          return [];
        }

        if (event.gesture === "primary-pinch" && event.phase === "end") {
          const hadActivePinch = primaryPinchStartedAt !== null;
          primaryPinchStartedAt = null;
          return hadActivePinch ? [{ type: "click", button: "left" }] : [];
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
        pointerControlEnabled = event.debug?.closedFist ?? false;
        return [];
      }
    }
  };

  return {
    getDebugState,
    mapEvent,
  };
};
