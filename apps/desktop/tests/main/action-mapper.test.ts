import { describe, expect, test } from "bun:test";
import { createActionMapper } from "../../src/main/action-mapper";

const createSettings = () => ({
  smoothing: 0.72,
  clickPinchThreshold: 0.78,
  dragHoldThresholdMs: 220,
  rightClickGesture: "thumb-middle-pinch",
  keyMappings: [{ gesture: "open-palm-hold", key: "Return" }],
});

describe("createActionMapper", () => {
  test("maps a short primary pinch to left click actions", () => {
    let time = 100;
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
      () => time,
    );

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "start",
      }),
    ).toEqual([]);

    time += 120;

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "end",
      }),
    ).toEqual([{ type: "click", button: "left" }]);

    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: false,
      primaryPinchActive: false,
      primaryPinchHeldMs: 0,
      primaryPinchOutcome: "idle",
    });
  });

  test("starts a drag after the hold threshold and releases on pinch end", () => {
    let time = 100;
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
      () => time,
    );

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "start",
      }),
    ).toEqual([]);

    time += 320;

    expect(
      mapper.mapEvent({
        type: "status",
        tracking: true,
        pinchStrength: 0,
        gesture: "closed-fist",
        debug: {
          confidence: 0.9,
          brightness: 0.4,
          frameDelayMs: 10,
          pose: "closed-fist",
          poseConfidence: 0.9,
          poseScores: {
            neutral: 0.05,
            "open-palm": 0.04,
            "closed-fist": 0.9,
            "primary-pinch": 0.01,
            "secondary-pinch": 0.01,
          },
          classifierMode: "learned",
          modelVersion: null,
          closedFist: true,
          closedFistFrames: 2,
          closedFistReleaseFrames: 0,
          closedFistLatched: true,
          openPalmHold: false,
          secondaryPinchStrength: 0.1,
        },
      }),
    ).toEqual([{ type: "pointer.down", button: "left" }]);

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "end",
      }),
    ).toEqual([{ type: "pointer.up", button: "left" }]);
  });

  test("reports drag preview once pinch hold crosses threshold", () => {
    let time = 100;
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
      () => time,
    );

    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "primary-pinch",
      phase: "start",
    });

    time += 120;
    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: false,
      primaryPinchActive: true,
      primaryPinchHeldMs: 120,
      primaryPinchOutcome: "click",
    });

    time += 200;
    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: false,
      primaryPinchActive: true,
      primaryPinchHeldMs: 320,
      primaryPinchOutcome: "drag",
    });
  });

  test("emits pointer down before move when drag starts during clutch motion", () => {
    let time = 100;
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
      () => time,
    );

    mapper.mapEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "closed-fist",
      debug: {
        confidence: 0.9,
        brightness: 0.4,
        frameDelayMs: 10,
        pose: "closed-fist",
        poseConfidence: 0.9,
        poseScores: {
          neutral: 0.05,
          "open-palm": 0.04,
          "closed-fist": 0.9,
          "primary-pinch": 0.01,
          "secondary-pinch": 0.01,
        },
        classifierMode: "learned",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 2,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.1,
      },
    });
    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "primary-pinch",
      phase: "start",
    });

    time += 260;

    expect(
      mapper.mapEvent({
        type: "pointer.observed",
        x: 0.62,
        y: 0.42,
        confidence: 0.91,
      }),
    ).toEqual([
      { type: "pointer.down", button: "left" },
      { type: "pointer.move", x: 62, y: 42 },
    ]);
  });

  test("maps symbolic gestures to configurable actions", () => {
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
    );

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "thumb-middle-pinch",
        phase: "instant",
      }),
    ).toEqual([{ type: "click", button: "right" }]);

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "open-palm-hold",
        phase: "instant",
      }),
    ).toEqual([{ type: "key.tap", key: "Return" }]);
  });

  test("only moves pointer while closed fist is active in status", () => {
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
    );

    expect(
      mapper.mapEvent({
        type: "pointer.observed",
        x: 0.62,
        y: 0.42,
        confidence: 0.91,
      }),
    ).toEqual([]);

    mapper.mapEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "closed-fist",
      debug: {
        confidence: 0.9,
        brightness: 0.4,
        frameDelayMs: 10,
        pose: "closed-fist",
        poseConfidence: 0.9,
        poseScores: {
          neutral: 0.05,
          "open-palm": 0.04,
          "closed-fist": 0.9,
          "primary-pinch": 0.01,
          "secondary-pinch": 0.01,
        },
        classifierMode: "learned",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 2,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.1,
      },
    });

    expect(
      mapper.mapEvent({
        type: "pointer.observed",
        x: 0.62,
        y: 0.42,
        confidence: 0.91,
      }),
    ).toEqual([{ type: "pointer.move", x: 62, y: 42 }]);
  });

  test("freezes movement again when status leaves closed fist", () => {
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
    );

    mapper.mapEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "closed-fist",
      debug: {
        confidence: 0.9,
        brightness: 0.4,
        frameDelayMs: 10,
        pose: "closed-fist",
        poseConfidence: 0.9,
        poseScores: {
          neutral: 0.05,
          "open-palm": 0.04,
          "closed-fist": 0.9,
          "primary-pinch": 0.01,
          "secondary-pinch": 0.01,
        },
        classifierMode: "learned",
        modelVersion: null,
        closedFist: true,
        closedFistFrames: 2,
        closedFistReleaseFrames: 0,
        closedFistLatched: true,
        openPalmHold: false,
        secondaryPinchStrength: 0.1,
      },
    });

    expect(
      mapper.mapEvent({
        type: "pointer.observed",
        x: 0.62,
        y: 0.42,
        confidence: 0.91,
      }),
    ).toEqual([{ type: "pointer.move", x: 62, y: 42 }]);

    mapper.mapEvent({
      type: "status",
      tracking: true,
      pinchStrength: 0,
      gesture: "open-palm",
      debug: {
        confidence: 0.9,
        brightness: 0.4,
        frameDelayMs: 10,
        pose: "open-palm",
        poseConfidence: 0.9,
        poseScores: {
          neutral: 0.05,
          "open-palm": 0.9,
          "closed-fist": 0.03,
          "primary-pinch": 0.01,
          "secondary-pinch": 0.01,
        },
        classifierMode: "learned",
        modelVersion: null,
        closedFist: false,
        closedFistFrames: 0,
        closedFistReleaseFrames: 1,
        closedFistLatched: false,
        openPalmHold: true,
        secondaryPinchStrength: 0.1,
      },
    });

    expect(
      mapper.mapEvent({
        type: "pointer.observed",
        x: 0.62,
        y: 0.42,
        confidence: 0.91,
      }),
    ).toEqual([]);

    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: false,
      primaryPinchActive: false,
      primaryPinchHeldMs: 0,
      primaryPinchOutcome: "idle",
    });
  });
});
