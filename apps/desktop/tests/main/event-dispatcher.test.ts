import { describe, expect, test } from "bun:test";
import { createEventDispatcher } from "../../src/main/event-dispatcher";

const waitForDrain = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("createEventDispatcher", () => {
  test("preserves gesture order while prioritizing status over pointer updates", async () => {
    const processed: string[] = [];
    const dispatcher = createEventDispatcher(
      async (event) => {
        processed.push(
          `${event.type}:${event.type === "gesture.intent" ? event.gesture : "latest"}`,
        );
      },
      () => {},
    );

    dispatcher.enqueue({
      type: "pointer.observed",
      x: 0.1,
      y: 0.2,
      confidence: 0.9,
    });
    dispatcher.enqueue({
      type: "pointer.observed",
      x: 0.4,
      y: 0.5,
      confidence: 0.9,
    });
    dispatcher.enqueue({
      type: "status",
      tracking: true,
      pinchStrength: 0.1,
      gesture: "idle",
    });
    dispatcher.enqueue({
      type: "status",
      tracking: true,
      pinchStrength: 0.2,
      gesture: "tracking",
    });
    dispatcher.enqueue({
      type: "gesture.intent",
      gesture: "closed-fist",
      phase: "instant",
    });
    dispatcher.enqueue({
      type: "gesture.intent",
      gesture: "primary-pinch",
      phase: "start",
    });

    await waitForDrain();

    expect(processed).toEqual([
      "gesture.intent:closed-fist",
      "gesture.intent:primary-pinch",
      "status:latest",
      "pointer.observed:latest",
    ]);
  });

  test("keeps only the newest high-rate updates while work is in flight", async () => {
    const processed: string[] = [];
    let releaseWork: (() => void) | null = null;
    const dispatcher = createEventDispatcher(
      (event) => {
        processed.push(
          event.type === "pointer.observed"
            ? `pointer:${event.x}`
            : `status:${event.gesture}`,
        );

        if (processed.length === 1) {
          return new Promise<void>((resolve) => {
            releaseWork = resolve;
          });
        }

        return Promise.resolve();
      },
      () => {},
    );

    dispatcher.enqueue({
      type: "pointer.observed",
      x: 0.1,
      y: 0.2,
      confidence: 0.9,
    });
    await Promise.resolve();

    dispatcher.enqueue({
      type: "pointer.observed",
      x: 0.7,
      y: 0.5,
      confidence: 0.9,
    });
    dispatcher.enqueue({
      type: "pointer.observed",
      x: 0.9,
      y: 0.6,
      confidence: 0.9,
    });
    dispatcher.enqueue({
      type: "status",
      tracking: true,
      pinchStrength: 0.1,
      gesture: "idle",
    });
    dispatcher.enqueue({
      type: "status",
      tracking: true,
      pinchStrength: 0.1,
      gesture: "tracking",
    });

    releaseWork?.();
    await waitForDrain();

    expect(processed).toEqual([
      "pointer:0.1",
      "status:tracking",
      "pointer:0.9",
    ]);
  });

  test("applies the newest status before the newest pointer after a busy period", async () => {
    const processed: string[] = [];
    let releaseWork: (() => void) | null = null;
    const dispatcher = createEventDispatcher(
      (event) => {
        processed.push(
          event.type === "status"
            ? `status:${event.debug?.closedFist ? "fist" : "open"}`
            : `pointer:${event.x}`,
        );

        if (processed.length === 1) {
          return new Promise<void>((resolve) => {
            releaseWork = resolve;
          });
        }

        return Promise.resolve();
      },
      () => {},
    );

    dispatcher.enqueue({
      type: "pointer.observed",
      x: 0.1,
      y: 0.2,
      confidence: 0.9,
    });
    await Promise.resolve();

    dispatcher.enqueue({
      type: "pointer.observed",
      x: 0.8,
      y: 0.5,
      confidence: 0.9,
    });
    dispatcher.enqueue({
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

    releaseWork?.();
    await waitForDrain();

    expect(processed).toEqual(["pointer:0.1", "status:fist", "pointer:0.8"]);
  });
});
