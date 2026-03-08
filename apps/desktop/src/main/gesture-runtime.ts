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
  pointerControlEnabled: boolean;
  inputSuppressed: boolean;
  debug: {
    confidence: number;
    brightness: number;
    frameDelayMs: number;
    pose: string;
    poseConfidence: number;
    poseScores: {
      neutral: number;
      "open-palm": number;
      "closed-fist": number;
      "primary-pinch": number;
      "secondary-pinch": number;
    };
    classifierMode: "rules" | "shadow" | "learned";
    modelVersion: string | null;
    learnedPose?: string;
    learnedPoseConfidence?: number;
    shadowDisagreement?: boolean;
    closedFist: boolean;
    closedFistFrames: number;
    closedFistReleaseFrames: number;
    closedFistLatched: boolean;
    openPalmHold: boolean;
    secondaryPinchStrength: number;
  };
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
    pointerControlEnabled: false,
    inputSuppressed: false,
    debug: {
      confidence: 0,
      brightness: 0,
      frameDelayMs: 0,
      pose: "unknown",
      poseConfidence: 0,
      poseScores: {
        neutral: 0,
        "open-palm": 0,
        "closed-fist": 0,
        "primary-pinch": 0,
        "secondary-pinch": 0,
      },
      classifierMode: "learned",
      modelVersion: null,
      closedFist: false,
      closedFistFrames: 0,
      closedFistReleaseFrames: 0,
      closedFistLatched: false,
      openPalmHold: false,
      secondaryPinchStrength: 0,
    },
    mapper: actionMapper.getDebugState(),
    lastError: null,
  };

  const syncMapperState = () => {
    state.mapper = actionMapper.getDebugState();
    state.pointerControlEnabled = state.mapper.pointerControlEnabled;
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
        case "debug.frame": {
          syncMapperState();
          return state;
        }

        case "pointer.observed": {
          if (!state.inputSuppressed) {
            for (const action of actionMapper.mapEvent(event)) {
              await executeAction(action);
            }
          }
          state.tracking = event.confidence > 0;
          syncMapperState();
          return state;
        }

        case "gesture.intent": {
          if (!state.inputSuppressed) {
            for (const action of actionMapper.mapEvent(event)) {
              await executeAction(action);
            }
          }

          syncMapperState();
          return state;
        }

        case "status": {
          state.tracking = event.tracking;
          state.gesture = event.gesture;
          state.pinchStrength = event.pinchStrength;
          state.debug = event.debug ?? state.debug;
          syncMapperState();
          return state;
        }

        case "capture.state": {
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

  const setInputSuppressed = (suppressed: boolean) => {
    state.inputSuppressed = suppressed;
    return getState();
  };

  return {
    handleEvent,
    getState,
    setInputSuppressed,
  };
};
