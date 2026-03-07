import type { GestureEvent } from "@airloom/shared/gesture-events";
import type { AirloomSettings } from "@airloom/shared/settings-schema";
import type { InputAdapter } from "./input/types";

export type RuntimeState = {
  tracking: boolean;
  gesture: string;
  pinchStrength: number;
  lastError: string | null;
};

type NormalizePosition = (
  x: number,
  y: number,
) => {
  x: number;
  y: number;
};

type GetSettings = () => AirloomSettings;

export const createGestureRuntime = (
  adapter: InputAdapter,
  normalizePosition: NormalizePosition,
  getSettings: GetSettings,
) => {
  const state: RuntimeState = {
    tracking: false,
    gesture: "idle",
    pinchStrength: 0,
    lastError: null,
  };

  const handleEvent = async (event: GestureEvent) => {
    try {
      switch (event.type) {
        case "pointer.move": {
          await adapter.movePointer(normalizePosition(event.x, event.y));
          state.tracking = event.confidence > 0;
          return state;
        }

        case "pointer.down": {
          await adapter.pointerDown(event.button);
          return state;
        }

        case "pointer.up": {
          await adapter.pointerUp(event.button);
          return state;
        }

        case "click": {
          await adapter.click(event.button);
          return state;
        }

        case "key.tap": {
          await adapter.tapKey(event.key);
          return state;
        }

        case "gesture.trigger": {
          const settings = getSettings();
          if (event.gesture === settings.rightClickGesture) {
            await adapter.click("right");
            return state;
          }

          const mapping = settings.keyMappings.find(
            (entry) => entry.gesture === event.gesture,
          );

          if (mapping) {
            await adapter.tapKey(mapping.key);
          }

          return state;
        }

        case "status": {
          state.tracking = event.tracking;
          state.gesture = event.gesture;
          state.pinchStrength = event.pinchStrength;
          return state;
        }
      }
    } catch (error) {
      state.lastError =
        error instanceof Error ? error.message : "Unknown runtime error";
      return state;
    }
  };

  const getState = () => {
    return { ...state };
  };

  return {
    handleEvent,
    getState,
  };
};
