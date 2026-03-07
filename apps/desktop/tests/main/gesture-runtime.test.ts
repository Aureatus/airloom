import { describe, expect, test } from "bun:test";
import { createGestureRuntime } from "../../src/main/gesture-runtime";
import type { InputAdapter } from "../../src/main/input/types";

const createTestAdapter = () => {
  const calls: string[] = [];
  const adapter: InputAdapter = {
    platform: "test",
    isAvailable: () => true,
    movePointer: async () => {
      calls.push("move");
    },
    pointerDown: async () => {
      calls.push("down");
    },
    pointerUp: async () => {
      calls.push("up");
    },
    click: async (button) => {
      calls.push(`click:${button}`);
    },
    tapKey: async (key) => {
      calls.push(`key:${key}`);
    },
  };

  return { adapter, calls };
};

const createTestSettings = (key = "Return") => {
  return {
    smoothing: 0.35,
    clickPinchThreshold: 0.78,
    dragHoldThresholdMs: 220,
    rightClickGesture: "thumb-middle-pinch",
    keyMappings: [{ gesture: "open-palm-hold", key }],
  };
};

describe("createGestureRuntime", () => {
  test("routes click and key events to adapter", async () => {
    const { adapter, calls } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings(),
    );

    await runtime.handleEvent({
      type: "gesture.intent",
      gesture: "primary-pinch",
      phase: "start",
    });
    await runtime.handleEvent({
      type: "gesture.intent",
      gesture: "primary-pinch",
      phase: "end",
    });
    await runtime.handleEvent({
      type: "gesture.intent",
      gesture: "open-palm-hold",
      phase: "instant",
    });

    expect(calls).toEqual(["down", "up", "click:left", "key:Return"]);
  });

  test("updates status state from status events", async () => {
    const { adapter } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings(),
    );

    await runtime.handleEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0.82,
      gesture: "short-pinch",
    });

    expect(runtime.getState()).toEqual({
      tracking: true,
      gesture: "short-pinch",
      pinchStrength: 0.82,
      mapper: {
        primaryPinchActive: false,
        primaryPinchHeldMs: 0,
        primaryPinchOutcome: "idle",
      },
      lastError: null,
    });
  });

  test("maps gesture triggers to configured keys", async () => {
    const { adapter, calls } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings("space"),
    );

    await runtime.handleEvent({
      type: "gesture.intent",
      gesture: "open-palm-hold",
      phase: "instant",
    });

    expect(calls).toEqual(["key:space"]);
  });

  test("maps the configured right-click gesture to a right click", async () => {
    const { adapter, calls } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings(),
    );

    await runtime.handleEvent({
      type: "gesture.intent",
      gesture: "thumb-middle-pinch",
      phase: "instant",
    });

    expect(calls).toEqual(["click:right"]);
  });
});
