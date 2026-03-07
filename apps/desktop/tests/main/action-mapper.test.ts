import { describe, expect, test } from "bun:test";
import { createActionMapper } from "../../src/main/action-mapper";

const createSettings = () => ({
  smoothing: 0.35,
  clickPinchThreshold: 0.78,
  rightClickGesture: "thumb-middle-pinch",
  keyMappings: [{ gesture: "open-palm-hold", key: "Return" }],
});

describe("createActionMapper", () => {
  test("maps primary pinch intents to left click actions", () => {
    const mapper = createActionMapper(
      () => createSettings(),
      (x, y) => ({ x: Math.round(x * 100), y: Math.round(y * 100) }),
    );

    expect(
      mapper.mapEvent({
        type: "gesture.intent",
        gesture: "primary-pinch",
        phase: "start",
      }),
    ).toEqual([{ type: "pointer.down", button: "left" }]);

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
});
