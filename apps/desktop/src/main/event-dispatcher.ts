import type { AirloomInputEvent } from "@airloom/shared/gesture-events";

type ProcessEvent = (event: AirloomInputEvent) => Promise<void>;
type AfterEvent = () => void;

export const createEventDispatcher = (
  processEvent: ProcessEvent,
  afterEvent: AfterEvent,
) => {
  const gestureQueue: AirloomInputEvent[] = [];
  let latestPointer: AirloomInputEvent | null = null;
  let latestCommand: AirloomInputEvent | null = null;
  let latestStatus: AirloomInputEvent | null = null;
  let draining = false;
  let stopped = false;

  const dequeue = () => {
    const nextGesture = gestureQueue.shift();
    if (nextGesture) {
      return nextGesture;
    }

    if (latestStatus !== null) {
      const status = latestStatus;
      latestStatus = null;
      return status;
    }

    if (latestCommand !== null) {
      const command = latestCommand;
      latestCommand = null;
      return command;
    }

    if (latestPointer !== null) {
      const pointer = latestPointer;
      latestPointer = null;
      return pointer;
    }

    return null;
  };

  const hasPending = () => {
      return (
      gestureQueue.length > 0 ||
      latestPointer !== null ||
      latestCommand !== null ||
      latestStatus !== null
    );
  };

  const drain = async () => {
    while (!stopped) {
      const nextEvent = dequeue();
      if (nextEvent === null) {
        break;
      }

      await processEvent(nextEvent);
      afterEvent();
    }

    draining = false;
    if (!stopped && hasPending()) {
      scheduleDrain();
    }
  };

  const scheduleDrain = () => {
    if (draining || stopped) {
      return;
    }

    draining = true;
    queueMicrotask(() => {
      void drain();
    });
  };

  const enqueue = (event: AirloomInputEvent) => {
    if (stopped) {
      return;
    }

    switch (event.type) {
      case "pointer.observed": {
        latestPointer = event;
        break;
      }

      case "status": {
        latestStatus = event;
        break;
      }

      case "command.observed": {
        latestCommand = event;
        break;
      }

      default: {
        gestureQueue.push(event);
      }
    }

    scheduleDrain();
  };

  const stop = () => {
    stopped = true;
    gestureQueue.length = 0;
    latestPointer = null;
    latestCommand = null;
    latestStatus = null;
  };

  return {
    enqueue,
    stop,
  };
};
