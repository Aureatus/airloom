import type {
  AirloomActionEvent,
  AirloomInputEvent,
} from "@airloom/shared/gesture-events";
import type { AirloomSettings } from "@airloom/shared/settings-schema";

type GetSettings = () => AirloomSettings;
type NormalizePosition = (x: number, y: number) => { x: number; y: number };

export const createActionMapper = (
  getSettings: GetSettings,
  normalizePosition: NormalizePosition,
) => {
  const mapEvent = (event: AirloomInputEvent): AirloomActionEvent[] => {
    switch (event.type) {
      case "pointer.observed": {
        return [
          {
            type: "pointer.move",
            ...normalizePosition(event.x, event.y),
          },
        ];
      }

      case "gesture.intent": {
        const settings = getSettings();

        if (event.gesture === "primary-pinch" && event.phase === "start") {
          return [{ type: "pointer.down", button: "left" }];
        }

        if (event.gesture === "primary-pinch" && event.phase === "end") {
          return [
            { type: "pointer.up", button: "left" },
            { type: "click", button: "left" },
          ];
        }

        if (
          event.gesture === settings.rightClickGesture &&
          event.phase === "instant"
        ) {
          return [{ type: "click", button: "right" }];
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
        return [];
      }
    }
  };

  return {
    mapEvent,
  };
};
