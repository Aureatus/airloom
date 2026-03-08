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
  primaryPinchOutcome: "idle" | "click" | "drag";
};

export const createActionMapper = (
  getSettings: GetSettings,
  normalizePosition: NormalizePosition,
  now: Now = () => Date.now(),
) => {
  let primaryPinchStartedAt: number | null = null;
  let primaryPinchDragging = false;
  let pointerControlEnabled = false;

  const maybeStartDrag = (thresholdMs: number): AirloomActionEvent[] => {
    if (primaryPinchStartedAt === null || primaryPinchDragging) {
      return [];
    }

    if (Math.max(0, now() - primaryPinchStartedAt) < thresholdMs) {
      return [];
    }

    primaryPinchDragging = true;
    return [{ type: "pointer.down", button: "left" }];
  };

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
      primaryPinchOutcome:
        primaryPinchDragging || heldMs >= getSettings().dragHoldThresholdMs
          ? "drag"
          : "click",
    };
  };

  const mapEvent = (event: AirloomInputEvent): AirloomActionEvent[] => {
    switch (event.type) {
      case "pointer.observed": {
        const settings = getSettings();
        const dragActions = maybeStartDrag(settings.dragHoldThresholdMs);
        if (!pointerControlEnabled) {
          return dragActions;
        }

        return [
          ...dragActions,
          {
            type: "pointer.move",
            ...normalizePosition(event.x, event.y),
          },
        ];
      }

      case "scroll.observed": {
        return event.amount === 0 ? [] : [{ type: "scroll", amount: event.amount }];
      }

      case "gesture.intent": {
        const settings = getSettings();

        if (event.gesture === "primary-pinch" && event.phase === "start") {
          primaryPinchStartedAt = now();
          primaryPinchDragging = false;
          return [];
        }

        if (event.gesture === "primary-pinch" && event.phase === "end") {
          const hadActivePinch = primaryPinchStartedAt !== null;
          const wasDragging = primaryPinchDragging;
          primaryPinchStartedAt = null;
          primaryPinchDragging = false;
          if (!hadActivePinch) {
            return [];
          }

          return wasDragging
            ? [{ type: "pointer.up", button: "left" }]
            : [{ type: "click", button: "left" }];
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
        return maybeStartDrag(getSettings().dragHoldThresholdMs);
      }
    }
  };

  return {
    getDebugState,
    mapEvent,
  };
};
