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

    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
    });

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "start",
      }),
    ).toEqual([{ type: "pointer.down", button: "left" }]);

    time += 120;

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "end",
      }),
    ).toEqual([
      { type: "pointer.up", button: "left" },
      { type: "click", button: "left" },
    ]);

    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: true,
      primaryPinchActive: false,
      primaryPinchHeldMs: 0,
      primaryPinchOutcome: "idle",
    });
  });

  test("maps a held primary pinch to drag release without click", () => {
    let time = 100;
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
      () => time,
    );

    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
    });

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "start",
      }),
    ).toEqual([{ type: "pointer.down", button: "left" }]);

    time += 320;

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "end",
      }),
    ).toEqual([{ type: "pointer.up", button: "left" }]);
  });

  test("reports click-vs-drag preview while pinch is active", () => {
    let time = 100;
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
      () => time,
    );

    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
    });

    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "primary-pinch",
      phase: "start",
    });

    time += 120;
    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: true,
      primaryPinchActive: true,
      primaryPinchHeldMs: 120,
      primaryPinchOutcome: "click",
    });

    time += 200;
    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: true,
      primaryPinchActive: true,
      primaryPinchHeldMs: 320,
      primaryPinchOutcome: "drag",
    });
  });

  test("maps symbolic gestures to configurable actions", () => {
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
    );

    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
    });

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

  test("keeps pointer frozen until the closed-fist toggle arms control", () => {
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
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
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

  test("releases an active drag when control is frozen again", () => {
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
    );

    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
    });
    mapper.mapEvent({
      type: "gesture.intent",
      gesture: "primary-pinch",
      phase: "start",
    });

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "closed-fist",
        phase: "instant",
      }),
    ).toEqual([{ type: "pointer.up", button: "left" }]);

    expect(mapper.getDebugState()).toEqual({
      pointerControlEnabled: false,
      primaryPinchActive: false,
      primaryPinchHeldMs: 0,
      primaryPinchOutcome: "idle",
    });
  });
});
