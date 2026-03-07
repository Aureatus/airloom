import type {
  AirloomActionEvent,
  AirloomInputEvent,
} from "@airloom/shared/gesture-events";
import type { AirloomSettings } from "@airloom/shared/settings-schema";
import {
  type ActionMapperDebugState,
  createActionMapper,
} from "./action-mapper";
import type { InputAdapter } from "./input/types";

export type RuntimeState = {
  tracking: boolean;
  gesture: string;
  pinchStrength: number;
  mapper: ActionMapperDebugState;
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
  const actionMapper = createActionMapper(getSettings, normalizePosition);
  const state: RuntimeState = {
    tracking: false,
    gesture: "idle",
    pinchStrength: 0,
    mapper: actionMapper.getDebugState(),
    lastError: null,
  };

  const syncMapperState = () => {
    state.mapper = actionMapper.getDebugState();
  };

  const executeAction = async (event: AirloomActionEvent) => {
    switch (event.type) {
      case "pointer.move": {
        await adapter.movePointer({ x: event.x, y: event.y });
        return;
      }

      case "pointer.down": {
        await adapter.pointerDown(event.button);
        return;
      }

      case "pointer.up": {
        await adapter.pointerUp(event.button);
        return;
      }

      case "click": {
        await adapter.click(event.button);
        return;
      }

      case "key.tap": {
        await adapter.tapKey(event.key);
        return;
      }
    }
  };

  const handleEvent = async (event: AirloomInputEvent) => {
    try {
      switch (event.type) {
        case "pointer.observed": {
          for (const action of actionMapper.mapEvent(event)) {
            await executeAction(action);
          }
          state.tracking = event.confidence > 0;
          syncMapperState();
          return state;
        }

        case "gesture.intent": {
          for (const action of actionMapper.mapEvent(event)) {
            await executeAction(action);
          }

          syncMapperState();
          return state;
        }

        case "status": {
          state.tracking = event.tracking;
          state.gesture = event.gesture;
          state.pinchStrength = event.pinchStrength;
          syncMapperState();
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
