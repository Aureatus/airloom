import { describe, expect, test } from "bun:test";
import { createEventDispatcher } from "../../src/main/event-dispatcher";

const waitForDrain = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("createEventDispatcher", () => {
  test("preserves gesture order while coalescing pointer and status updates", async () => {
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
      "pointer.observed:latest",
      "status:latest",
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
      "pointer:0.9",
      "status:tracking",
    ]);
  });
});
