import type {
  AirloomActionEvent,
  AirloomInputEvent,
} from "@incantation/shared/gesture-events";
import type { AirloomSettings } from "@incantation/shared/settings-schema";

type GetSettings = () => AirloomSettings;
type NormalizePosition = (x: number, y: number) => { x: number; y: number };
type Now = () => number;
type CommandModeSubmode = "idle" | "right-click" | "scroll" | "workspace";
type ScrollBand = -2 | -1 | 0 | 1 | 2;

export type ActionMapperDebugState = {
  pointerControlEnabled: boolean;
  primaryPinchActive: boolean;
  primaryPinchHeldMs: number;
  primaryPinchOutcome: "idle" | "click" | "drag";
  commandModeActive: boolean;
  commandModeSubmode: CommandModeSubmode;
  commandDeltaX: number;
  commandDeltaY: number;
  workspaceDirection: "idle" | "previous" | "next";
};

export const createActionMapper = (
  getSettings: GetSettings,
  normalizePosition: NormalizePosition,
  now: Now = () => Date.now(),
) => {
  let primaryPinchStartedAt: number | null = null;
  let primaryPinchDragging = false;
  let pointerControlEnabled = false;
  let pushToTalkActive = false;
  let commandModeActive = false;
  let commandModeSubmode: CommandModeSubmode = "idle";
  let commandDeltaX = 0;
  let commandDeltaY = 0;
  let commandScrollRemainder = 0;
  let commandScrollBand: ScrollBand = 0;
  let pendingScrollBand: ScrollBand = 0;
  let pendingScrollFrames = 0;
  let lastScrollTickAt: number | null = null;
  let workspaceStepsEmitted = 0;

  const resetCommandMode = () => {
    commandModeActive = false;
    commandModeSubmode = "idle";
    commandDeltaX = 0;
    commandDeltaY = 0;
    commandScrollRemainder = 0;
    commandScrollBand = 0;
    pendingScrollBand = 0;
    pendingScrollFrames = 0;
    lastScrollTickAt = null;
    workspaceStepsEmitted = 0;
  };

  const clearScrollBand = () => {
    commandScrollBand = 0;
    pendingScrollBand = 0;
    pendingScrollFrames = 0;
    commandScrollRemainder = 0;
    lastScrollTickAt = null;
  };

  const deriveScrollBand = (
    deltaY: number,
    absY: number,
    fastThreshold: number,
  ): ScrollBand => {
    if (absY < fastThreshold) {
      return deltaY < 0 ? -1 : 1;
    }

    return deltaY < 0 ? -2 : 2;
  };

  const emitScrollTicks = (timestamp: number): AirloomActionEvent[] => {
    if (commandScrollBand === 0) {
      lastScrollTickAt = timestamp;
      return [];
    }

    if (lastScrollTickAt === null) {
      lastScrollTickAt = timestamp;
      return [];
    }

    const elapsedMs = Math.max(0, timestamp - lastScrollTickAt);
    lastScrollTickAt = timestamp;
    if (elapsedMs === 0) {
      return [];
    }

    const settings = getSettings();
    const slowStepsPerSecond = settings.commandModeScrollGain / 8;
    const fastStepsPerSecond = settings.commandModeScrollGain / 4;
    const stepsPerSecond =
      Math.abs(commandScrollBand) === 2
        ? fastStepsPerSecond
        : slowStepsPerSecond;
    const direction = commandScrollBand < 0 ? -1 : 1;
    commandScrollRemainder += direction * (elapsedMs / 1000) * stepsPerSecond;
    const wholeSteps =
      commandScrollRemainder > 0
        ? Math.floor(commandScrollRemainder)
        : Math.ceil(commandScrollRemainder);
    commandScrollRemainder -= wholeSteps;
    return wholeSteps === 0 ? [] : [{ type: "scroll", amount: wholeSteps }];
  };

  const maybeStartDrag = (thresholdMs: number): AirloomActionEvent[] => {
    if (
      commandModeActive ||
      primaryPinchStartedAt === null ||
      primaryPinchDragging
    ) {
      return [];
    }

    if (Math.max(0, now() - primaryPinchStartedAt) < thresholdMs) {
      return [];
    }

    primaryPinchDragging = true;
    return [{ type: "pointer.down", button: "left" }];
  };

  const getWorkspaceDirection = () => {
    if (workspaceStepsEmitted < 0) {
      return "previous" as const;
    }
    if (workspaceStepsEmitted > 0) {
      return "next" as const;
    }
    return "idle" as const;
  };

  const getDebugState = (): ActionMapperDebugState => {
    if (primaryPinchStartedAt === null) {
      return {
        pointerControlEnabled,
        primaryPinchActive: false,
        primaryPinchHeldMs: 0,
        primaryPinchOutcome: "idle",
        commandModeActive,
        commandModeSubmode,
        commandDeltaX,
        commandDeltaY,
        workspaceDirection: getWorkspaceDirection(),
      };
    }

    const heldMs = Math.max(0, now() - primaryPinchStartedAt);

    return {
      pointerControlEnabled,
      primaryPinchActive: true,
      primaryPinchHeldMs: heldMs,
      primaryPinchOutcome:
        commandModeActive ||
        primaryPinchDragging ||
        heldMs >= getSettings().dragHoldThresholdMs
          ? "drag"
          : "click",
      commandModeActive,
      commandModeSubmode,
      commandDeltaX,
      commandDeltaY,
      workspaceDirection: getWorkspaceDirection(),
    };
  };

  const releaseHeldActions = (): AirloomActionEvent[] => {
    const actions: AirloomActionEvent[] = [];
    if (primaryPinchDragging) {
      actions.push({ type: "pointer.up", button: "left" });
    }
    if (pushToTalkActive) {
      actions.push({ type: "key.up", key: getSettings().pushToTalkKey });
    }

    primaryPinchStartedAt = null;
    primaryPinchDragging = false;
    pushToTalkActive = false;
    resetCommandMode();

    return actions;
  };

  const mapCommandObservation = (
    event: Extract<AirloomInputEvent, { type: "command.observed" }>,
  ): AirloomActionEvent[] => {
    if (!commandModeActive) {
      return [];
    }

    const settings = getSettings();
    const effectiveDeltaX = event.normalizedDeltaX ?? event.deltaX;
    const effectiveDeltaY = event.normalizedDeltaY ?? event.deltaY;
    const rawAbsX = Math.abs(event.deltaX);
    const rawAbsY = Math.abs(event.deltaY);
    const absX = Math.abs(effectiveDeltaX);
    const absY = Math.abs(effectiveDeltaY);
    const rawMovementFloor = settings.commandModeRightClickDeadzone * 0.5;
    commandDeltaX = effectiveDeltaX;
    commandDeltaY = effectiveDeltaY;

    if (
      absX <= settings.commandModeRightClickDeadzone &&
      absY <= settings.commandModeRightClickDeadzone
    ) {
      commandModeSubmode = "right-click";
      workspaceStepsEmitted = 0;
      clearScrollBand();
      return [];
    }

    const verticalDominant =
      absY >= settings.commandModeScrollDeadzone &&
      rawAbsY >= rawMovementFloor &&
      absY >= absX + settings.commandModeRightClickDeadzone / 2;
    if (verticalDominant) {
      workspaceStepsEmitted = 0;
      const nextBand = deriveScrollBand(
        effectiveDeltaY,
        absY,
        settings.commandModeScrollFastThreshold,
      );

      if (commandScrollBand === 0) {
        if (pendingScrollBand === nextBand) {
          pendingScrollFrames += 1;
        } else {
          pendingScrollBand = nextBand;
          pendingScrollFrames = 1;
        }

        if (pendingScrollFrames < 2) {
          return [];
        }

        commandScrollBand = nextBand;
        commandModeSubmode = "scroll";
        commandScrollRemainder = 0;
        lastScrollTickAt = now();
        return [];
      }

      commandModeSubmode = "scroll";
      pendingScrollBand = nextBand;
      pendingScrollFrames = 2;
      if (commandScrollBand !== nextBand) {
        commandScrollBand = nextBand;
        commandScrollRemainder = 0;
        lastScrollTickAt = now();
        return [];
      }

      return emitScrollTicks(now());
    }

    pendingScrollBand = 0;
    pendingScrollFrames = 0;
    if (commandScrollBand !== 0) {
      clearScrollBand();
    }
    if (
      absY <=
      Math.max(
        settings.commandModeRightClickDeadzone,
        settings.commandModeScrollDeadzone * 0.7,
      )
    ) {
      clearScrollBand();
      commandModeSubmode = "right-click";
    }

    const horizontalDominant =
      absX >= settings.commandModeWorkspaceThreshold &&
      rawAbsX >= rawMovementFloor &&
      absX >= absY + settings.commandModeRightClickDeadzone / 2;
    if (!horizontalDominant) {
      return [];
    }

    commandModeSubmode = "workspace";
    clearScrollBand();

    const direction = event.deltaX < 0 ? -1 : 1;
    if (
      workspaceStepsEmitted !== 0 &&
      Math.sign(workspaceStepsEmitted) !== direction
    ) {
      return [];
    }

    const desiredSteps =
      Math.floor(
        Math.max(0, absX - settings.commandModeWorkspaceThreshold) /
          settings.commandModeWorkspaceStep,
      ) + 1;
    const additionalSteps = desiredSteps - Math.abs(workspaceStepsEmitted);
    if (additionalSteps <= 0) {
      return [];
    }

    workspaceStepsEmitted = direction * desiredSteps;
    const workspaceKey =
      direction < 0 ? settings.workspacePreviousKey : settings.workspaceNextKey;
    if (!workspaceKey) {
      return [];
    }

    return Array.from({ length: additionalSteps }, () => ({
      type: "key.tap" as const,
      key: workspaceKey,
    }));
  };

  const mapEvent = (event: AirloomInputEvent): AirloomActionEvent[] => {
    switch (event.type) {
      case "pointer.observed": {
        const settings = getSettings();
        const dragActions = maybeStartDrag(settings.dragHoldThresholdMs);
        if (!pointerControlEnabled) {
          return dragActions;
        }

        return [
          ...dragActions,
          {
            type: "pointer.move",
            ...normalizePosition(event.x, event.y),
          },
        ];
      }

      case "scroll.observed": {
        return event.amount === 0
          ? []
          : [{ type: "scroll", amount: event.amount }];
      }

      case "command.observed": {
        return mapCommandObservation(event);
      }

      case "gesture.intent": {
        const settings = getSettings();

        if (event.gesture === "secondary-pinch" && event.phase === "start") {
          resetCommandMode();
          commandModeActive = true;
          commandModeSubmode = "right-click";
          return [];
        }

        if (event.gesture === "secondary-pinch" && event.phase === "end") {
          const shouldRightClick =
            commandModeActive && commandModeSubmode === "right-click";
          resetCommandMode();
          return shouldRightClick ? [{ type: "click", button: "right" }] : [];
        }

        if (event.gesture === "secondary-pinch" && event.phase === "cancel") {
          resetCommandMode();
          return [];
        }

        if (commandModeActive && event.gesture === "primary-pinch") {
          return [];
        }

        if (event.gesture === "primary-pinch" && event.phase === "start") {
          primaryPinchStartedAt = now();
          primaryPinchDragging = false;
          return [];
        }

        if (event.gesture === "primary-pinch" && event.phase === "end") {
          const hadActivePinch = primaryPinchStartedAt !== null;
          const wasDragging = primaryPinchDragging;
          primaryPinchStartedAt = null;
          primaryPinchDragging = false;
          if (!hadActivePinch) {
            return [];
          }

          return wasDragging
            ? [{ type: "pointer.up", button: "left" }]
            : [{ type: "click", button: "left" }];
        }

        if (
          event.gesture === settings.rightClickGesture &&
          event.phase === "instant"
        ) {
          return [{ type: "click", button: "right" }];
        }

        if (event.gesture === settings.pushToTalkGesture) {
          if (event.phase === "start") {
            if (pushToTalkActive) {
              return [];
            }
            pushToTalkActive = true;
            return [{ type: "key.down", key: settings.pushToTalkKey }];
          }

          if (event.phase === "end") {
            if (!pushToTalkActive) {
              return [];
            }
            pushToTalkActive = false;
            return [{ type: "key.up", key: settings.pushToTalkKey }];
          }
        }

        const mapping = settings.keyMappings.find(
          (entry) => entry.gesture === event.gesture,
        );

        if (mapping && event.phase === "instant") {
          return [{ type: "key.tap", key: mapping.key }];
        }

        return [];
      }

      case "status": {
        pointerControlEnabled = event.debug?.closedFist ?? false;
        const actions: AirloomActionEvent[] = [];
        if (pushToTalkActive && event.gesture !== "push-to-talk") {
          actions.push({ type: "key.up", key: getSettings().pushToTalkKey });
          pushToTalkActive = false;
        }
        if (
          commandModeActive &&
          (!event.tracking || event.debug?.secondaryPinchActive === false)
        ) {
          resetCommandMode();
        }
        if (commandModeActive && commandModeSubmode === "scroll") {
          actions.push(...emitScrollTicks(now()));
        }
        return [
          ...actions,
          ...maybeStartDrag(getSettings().dragHoldThresholdMs),
        ];
      }
    }
  };

  return {
    getDebugState,
    mapEvent,
    releaseHeldActions,
  };
};
