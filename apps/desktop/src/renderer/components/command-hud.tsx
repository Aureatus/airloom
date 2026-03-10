import type { AirloomSettings } from "@airloom/shared/settings-schema";

type CommandHudProps = {
  active: boolean;
  submode: "idle" | "right-click" | "scroll" | "workspace";
  deltaX: number;
  deltaY: number;
  workspaceDirection: "idle" | "previous" | "next";
  settings: Pick<
    AirloomSettings,
    | "commandModeRightClickDeadzone"
    | "commandModeScrollDeadzone"
    | "commandModeScrollFastThreshold"
    | "commandModeWorkspaceThreshold"
    | "commandModeWorkspaceStep"
  >;
  overlayOnly?: boolean;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

export const CommandHud = ({
  active,
  submode,
  deltaX,
  deltaY,
  workspaceDirection,
  settings,
  overlayOnly = false,
}: CommandHudProps) => {
  const maxHorizontal = Math.max(
    settings.commandModeWorkspaceThreshold +
      settings.commandModeWorkspaceStep * 2,
    settings.commandModeRightClickDeadzone * 2,
    0.16,
  );
  const maxVertical = Math.max(
    settings.commandModeScrollDeadzone * 2.5,
    settings.commandModeRightClickDeadzone * 2,
    0.16,
  );
  const dotX = clamp(deltaX / maxHorizontal, -1, 1) * 56;
  const dotY = clamp(deltaY / maxVertical, -1, 1) * 56;

  let hudClass = "inactive";
  let currentLabel = "Hold secondary pinch to enter command mode";
  let releaseLabel = "Release -> no action";
  const absY = Math.abs(deltaY);
  const scrollTier =
    absY >= settings.commandModeScrollFastThreshold ? "fast" : "slow";

  if (active && submode === "scroll") {
    hudClass = "scroll";
    currentLabel = `${scrollTier === "fast" ? "Fast" : "Slow"} ${
      deltaY < 0 ? "scroll upward" : "scroll downward"
    }`;
    releaseLabel = "Release -> no click";
  } else if (active && submode === "workspace") {
    hudClass = "workspace";
    currentLabel =
      workspaceDirection === "previous"
        ? "Step to previous workspace"
        : workspaceDirection === "next"
          ? "Step to next workspace"
          : "Workspace stepping";
    releaseLabel = "Release -> no click";
  } else if (active) {
    hudClass = "right-click";
    currentLabel = "Right click ready";
    releaseLabel = "Release -> right click";
  }

  return (
    <div className={overlayOnly ? "command-hud-shell" : undefined}>
      <aside className={`command-hud command-hud-${hudClass}`}>
        <div className="command-hud-eyebrow">
          {active ? "Command HUD" : "Command HUD"}
        </div>
        <div className="command-hud-dial">
          <div className="command-hud-aura" />
          <div className="command-hud-hex" />
          <div className="command-hud-star command-hud-star-major" />
          <div className="command-hud-star command-hud-star-minor" />
          <div className="command-hud-orbit" />
          <div className="command-hud-ring" />
          <div className="command-hud-ring command-hud-ring-mid" />
          <div className="command-hud-ring command-hud-ring-inner" />
          <div className="command-hud-crosshair command-hud-crosshair-x" />
          <div className="command-hud-crosshair command-hud-crosshair-y" />
          <div className="command-hud-rune command-hud-rune-nw">✦</div>
          <div className="command-hud-rune command-hud-rune-ne">✶</div>
          <div className="command-hud-rune command-hud-rune-sw">✶</div>
          <div className="command-hud-rune command-hud-rune-se">✦</div>
          <div className="command-hud-label command-hud-label-top">Scroll</div>
          <div className="command-hud-label command-hud-label-right">
            Workspace
          </div>
          <div className="command-hud-label command-hud-label-bottom">
            Scroll
          </div>
          <div className="command-hud-label command-hud-label-left">
            Workspace
          </div>
          <div className="command-hud-center">
            <span>Click</span>
          </div>
          <div
            className="command-hud-dot"
            style={{
              left: `calc(50% + ${active ? dotX : 0}px)`,
              top: `calc(50% + ${active ? dotY : 0}px)`,
            }}
          />
        </div>
        <div className="command-hud-copy">
          <strong>{currentLabel}</strong>
          <span>{releaseLabel}</span>
        </div>
      </aside>
    </div>
  );
};
