import type {
  AirloomActionEvent,
  AirloomInputEvent,
} from "@incantation/shared/gesture-events";
import type { AirloomSettings } from "@incantation/shared/settings-schema";

type GetSettings = () => AirloomSettings;
type NormalizePosition = (x: number, y: number) => { x: number; y: number };
type Now = () => number;
type CommandModeSubmode = "idle" | "right-click" | "scroll" | "workspace";

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
  let dragAnchorObservation: { x: number; y: number } | null = null;
  let lastPointerObservation: { x: number; y: number } | null = null;
  let pushToTalkActive = false;
  let commandModeActive = false;
  let commandModeSubmode: CommandModeSubmode = "idle";
  let commandDeltaX = 0;
  let commandDeltaY = 0;
  let workspaceStepsEmitted = 0;

  const resetCommandMode = () => {
    commandModeActive = false;
    commandModeSubmode = "idle";
    commandDeltaX = 0;
    commandDeltaY = 0;
    workspaceStepsEmitted = 0;
  };

  const maybeStartDragFromPointerMovement = (
    event: Extract<AirloomInputEvent, { type: "pointer.observed" }>,
  ): AirloomActionEvent[] => {
    if (
      commandModeActive ||
      !pointerControlEnabled ||
      primaryPinchStartedAt === null ||
      primaryPinchDragging
    ) {
      return [];
    }

    if (dragAnchorObservation === null) {
      dragAnchorObservation = lastPointerObservation ?? {
        x: event.x,
        y: event.y,
      };
      return [];
    }

    const movement = Math.hypot(
      event.x - dragAnchorObservation.x,
      event.y - dragAnchorObservation.y,
    );
    if (movement < getSettings().dragStartDeadzone) {
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
      primaryPinchOutcome: primaryPinchDragging ? "drag" : "click",
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
    dragAnchorObservation = null;
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
      return [];
    }

    const verticalDominant =
      absY >= settings.commandModeRightClickDeadzone &&
      rawAbsY >= rawMovementFloor &&
      absY >= absX + settings.commandModeRightClickDeadzone / 2;
    if (verticalDominant) {
      commandModeSubmode = "idle";
      workspaceStepsEmitted = 0;
      return [];
    }

    const horizontalDominant =
      absX >= settings.commandModeWorkspaceThreshold &&
      rawAbsX >= rawMovementFloor &&
      absX >= absY + settings.commandModeRightClickDeadzone / 2;
    if (!horizontalDominant) {
      return [];
    }

    commandModeSubmode = "workspace";

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
        const dragActions = maybeStartDragFromPointerMovement(event);
        if (pointerControlEnabled) {
          lastPointerObservation = { x: event.x, y: event.y };
        }
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
        if (event.gesture === "secondary-pinch" && event.phase === "start") {
          resetCommandMode();
          return [];
        }

        if (event.gesture === "secondary-pinch" && event.phase === "end") {
          resetCommandMode();
          return [];
        }

        if (event.gesture === "secondary-pinch" && event.phase === "cancel") {
          resetCommandMode();
          return [];
        }

        const settings = getSettings();

        if (commandModeActive && event.gesture === "primary-pinch") {
          return [];
        }

        if (event.gesture === "primary-pinch" && event.phase === "start") {
          primaryPinchStartedAt = now();
          primaryPinchDragging = false;
          dragAnchorObservation = lastPointerObservation;
          return [];
        }

        if (event.gesture === "primary-pinch" && event.phase === "end") {
          const hadActivePinch = primaryPinchStartedAt !== null;
          const wasDragging = primaryPinchDragging;
          primaryPinchStartedAt = null;
          primaryPinchDragging = false;
          dragAnchorObservation = null;
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
        if (!pointerControlEnabled) {
          dragAnchorObservation = null;
          lastPointerObservation = null;
        }
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
        return actions;
      }
    }
  };

  return {
    getDebugState,
    mapEvent,
    releaseHeldActions,
  };
};
