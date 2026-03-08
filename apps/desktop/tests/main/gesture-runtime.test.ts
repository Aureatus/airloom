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
    smoothing: 0.72,
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
      gesture: "closed-fist",
      phase: "instant",
    });

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

    expect(calls).toEqual(["click:left", "key:Return"]);
    expect(runtime.getState().recentActions).toEqual(["left click", "Key Return"]);
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
      debug: {
        confidence: 0.74,
        brightness: 0.21,
        frameDelayMs: 18,
        pose: "closed-fist",
        poseConfidence: 0.88,
        poseScores: {
          neutral: 0.12,
          "open-palm": 0.18,
          "closed-fist": 0.88,
          "primary-pinch": 0.14,
          "secondary-pinch": 0.06,
        },
        classifierMode: "rules",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 4,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.14,
      },
    });

    expect(runtime.getState()).toEqual({
      tracking: true,
      gesture: "short-pinch",
      pinchStrength: 0.82,
      pointerControlEnabled: true,
      inputSuppressed: false,
      recentActions: [],
      debug: {
        confidence: 0.74,
        brightness: 0.21,
        frameDelayMs: 18,
        pose: "closed-fist",
        poseConfidence: 0.88,
        poseScores: {
          neutral: 0.12,
          "open-palm": 0.18,
          "closed-fist": 0.88,
          "primary-pinch": 0.14,
          "secondary-pinch": 0.06,
        },
        classifierMode: "rules",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 4,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.14,
      },
      mapper: {
        pointerControlEnabled: true,
        primaryPinchActive: false,
        primaryPinchHeldMs: 0,
        primaryPinchOutcome: "idle",
      },
      lastError: null,
    });
  });

  test("suppresses pointer and gesture actions during capture mode", async () => {
    const { adapter, calls } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings(),
    );

    runtime.setInputSuppressed(true);

    await runtime.handleEvent({
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
    });
    await runtime.handleEvent({
      type: "pointer.observed",
      x: 0.4,
      y: 0.5,
      confidence: 0.92,
    });

    expect(calls).toEqual([]);
    expect(runtime.getState().inputSuppressed).toBe(true);
    expect(runtime.getState().recentActions).toEqual([]);

    runtime.setInputSuppressed(false);
    await runtime.handleEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "closed-fist",
      debug: {
        confidence: 0.74,
        brightness: 0.21,
        frameDelayMs: 18,
        pose: "closed-fist",
        poseConfidence: 0.88,
        poseScores: {
          neutral: 0.12,
          "open-palm": 0.18,
          "closed-fist": 0.88,
          "primary-pinch": 0.14,
          "secondary-pinch": 0.06,
        },
        classifierMode: "rules",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 4,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.14,
      },
    });
    await runtime.handleEvent({
      type: "pointer.observed",
      x: 0.4,
      y: 0.5,
      confidence: 0.92,
    });

    expect(calls).toEqual(["move"]);
    expect(runtime.getState().recentActions).toEqual(["Move 0.40, 0.50"]);
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

  test("ignores pointer movement until closed-fist status is active", async () => {
    const { adapter, calls } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings(),
    );

    await runtime.handleEvent({
      type: "pointer.observed",
      x: 0.4,
      y: 0.5,
      confidence: 0.92,
    });
    await runtime.handleEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "closed-fist",
      debug: {
        confidence: 0.74,
        brightness: 0.21,
        frameDelayMs: 18,
        pose: "closed-fist",
        poseConfidence: 0.88,
        poseScores: {
          neutral: 0.12,
          "open-palm": 0.18,
          "closed-fist": 0.88,
          "primary-pinch": 0.14,
          "secondary-pinch": 0.06,
        },
        classifierMode: "rules",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 4,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.14,
      },
    });
    await runtime.handleEvent({
      type: "pointer.observed",
      x: 0.4,
      y: 0.5,
      confidence: 0.92,
    });

    expect(calls).toEqual(["move"]);
    expect(runtime.getState().pointerControlEnabled).toBe(true);
  });

  test("freezes pointer again when status leaves closed fist", async () => {
    const { adapter, calls } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings(),
    );

    await runtime.handleEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "closed-fist",
      debug: {
        confidence: 0.74,
        brightness: 0.21,
        frameDelayMs: 18,
        pose: "closed-fist",
        poseConfidence: 0.88,
        poseScores: {
          neutral: 0.12,
          "open-palm": 0.18,
          "closed-fist": 0.88,
          "primary-pinch": 0.14,
          "secondary-pinch": 0.06,
        },
        classifierMode: "rules",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 4,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.14,
      },
    });
    await runtime.handleEvent({
      type: "pointer.observed",
      x: 0.4,
      y: 0.5,
      confidence: 0.92,
    });
    await runtime.handleEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "open-palm",
      debug: {
        confidence: 0.74,
        brightness: 0.21,
        frameDelayMs: 18,
        pose: "open-palm",
        poseConfidence: 0.88,
        poseScores: {
          neutral: 0.12,
          "open-palm": 0.88,
          "closed-fist": 0.08,
          "primary-pinch": 0.04,
          "secondary-pinch": 0.03,
        },
        classifierMode: "rules",
        modelVersion: null,
        closedFist: false,
        closedFistFrames: 0,
        closedFistReleaseFrames: 1,
        closedFistLatched: false,
        openPalmHold: true,
        secondaryPinchStrength: 0.14,
      },
    });
    await runtime.handleEvent({
      type: "pointer.observed",
      x: 0.45,
      y: 0.55,
      confidence: 0.92,
    });

    expect(calls).toEqual(["move"]);
    expect(runtime.getState().pointerControlEnabled).toBe(false);
  });

  test("ignores backend debug frame events for input actions", async () => {
    const { adapter, calls } = createTestAdapter();
    const runtime = createGestureRuntime(
      adapter,
      (x, y) => ({ x, y }),
      () => createTestSettings(),
    );

    await runtime.handleEvent({
      type: "debug.frame",
      mimeType: "image/jpeg",
      data: "abc123",
      width: 160,
      height: 120,
    });

    expect(calls).toEqual([]);
    expect(runtime.getState().lastError).toBeNull();
  });
});
