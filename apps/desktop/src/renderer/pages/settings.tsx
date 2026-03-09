import type { AirloomSettings } from "@airloom/shared/settings-schema";
import { useEffect, useState } from "react";

type SettingsPageProps = {
  settings: AirloomSettings;
  onSave: (settings: AirloomSettings) => Promise<void>;
};

export const SettingsPage = ({ settings, onSave }: SettingsPageProps) => {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateMapping = (gesture: string, key: string) => {
    setDraft((current) => ({
      ...current,
      keyMappings: current.keyMappings.map((mapping) =>
        mapping.gesture === gesture ? { ...mapping, key } : mapping,
      ),
    }));
  };

  const addMapping = () => {
    setDraft((current) => ({
      ...current,
      keyMappings: [
        ...current.keyMappings,
        { gesture: `custom-${current.keyMappings.length + 1}`, key: "space" },
      ],
    }));
  };

  const removeMapping = (gesture: string) => {
    setDraft((current) => ({
      ...current,
      keyMappings: current.keyMappings.filter(
        (mapping) => mapping.gesture !== gesture,
      ),
    }));
  };

  return (
    <section className="panel">
      <div className="eyebrow">Mappings</div>
      <h2>Default gesture actions</h2>
      <div className="mapping-list">
        <div className="mapping-row">
          <span>Pointer movement</span>
          <strong>Hold closed fist</strong>
        </div>
        <div className="mapping-row">
          <span>Pointer tracking</span>
          <strong>Direct hand position</strong>
        </div>
        <div className="mapping-row">
          <span>Left click</span>
          <strong>Primary pinch</strong>
        </div>
        <div className="mapping-row">
          <span>Right click</span>
          <strong>Secondary pinch release</strong>
        </div>
        <div className="mapping-row">
          <span>Scroll</span>
          <strong>Secondary pinch + vertical pull</strong>
        </div>
        <div className="mapping-row">
          <span>Workspace nav</span>
          <strong>Secondary pinch + horizontal pull</strong>
        </div>
        <div className="mapping-row">
          <span>Mapped keybind</span>
          <strong>Open palm hold</strong>
        </div>
        <div className="mapping-row">
          <span>Push to talk</span>
          <strong>
            {draft.pushToTalkGesture} {"->"} {draft.pushToTalkKey}
          </strong>
        </div>
      </div>
      <div className="settings-grid">
        <label className="settings-field">
          <span>Smoothing</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={draft.smoothing}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                smoothing: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Pointer margin</span>
          <input
            type="number"
            min="0"
            max="0.35"
            step="0.01"
            value={draft.pointerRegionMargin}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                pointerRegionMargin: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Pinch threshold</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={draft.clickPinchThreshold}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                clickPinchThreshold: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Workspace previous key</span>
          <input
            type="text"
            value={draft.workspacePreviousKey}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                workspacePreviousKey: event.target.value,
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Workspace next key</span>
          <input
            type="text"
            value={draft.workspaceNextKey}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                workspaceNextKey: event.target.value,
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Command HUD position</span>
          <select
            value={draft.commandHudPosition}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commandHudPosition: event.target.value as AirloomSettings["commandHudPosition"],
              }))
            }
          >
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Camera HUD position</span>
          <select
            value={draft.cameraHudPosition}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                cameraHudPosition: event.target.value as AirloomSettings["cameraHudPosition"],
              }))
            }
          >
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Right-click deadzone</span>
          <input
            type="number"
            min="0"
            max="0.2"
            step="0.01"
            value={draft.commandModeRightClickDeadzone}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commandModeRightClickDeadzone: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Scroll deadzone</span>
          <input
            type="number"
            min="0"
            max="0.3"
            step="0.01"
            value={draft.commandModeScrollDeadzone}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commandModeScrollDeadzone: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Fast scroll threshold</span>
          <input
            type="number"
            min="0.05"
            max="0.4"
            step="0.01"
            value={draft.commandModeScrollFastThreshold}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commandModeScrollFastThreshold: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Scroll gain</span>
          <input
            type="number"
            min="1"
            max="200"
            step="1"
            value={draft.commandModeScrollGain}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commandModeScrollGain: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Workspace threshold</span>
          <input
            type="number"
            min="0.01"
            max="0.5"
            step="0.01"
            value={draft.commandModeWorkspaceThreshold}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commandModeWorkspaceThreshold: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Workspace step</span>
          <input
            type="number"
            min="0.01"
            max="0.5"
            step="0.01"
            value={draft.commandModeWorkspaceStep}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                commandModeWorkspaceStep: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Legacy right click gesture</span>
          <input
            type="text"
            value={draft.rightClickGesture}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                rightClickGesture: event.target.value,
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Push-to-talk gesture</span>
          <input
            type="text"
            value={draft.pushToTalkGesture}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                pushToTalkGesture: event.target.value,
              }))
            }
          />
        </label>
        <label className="settings-field">
          <span>Push-to-talk key</span>
          <input
            type="text"
            value={draft.pushToTalkKey}
            placeholder="Ctrl+Space"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                pushToTalkKey: event.target.value,
              }))
            }
          />
        </label>
      </div>
      <div className="mapping-editor">
        {draft.keyMappings.map((mapping) => (
          <div className="mapping-editor-row" key={mapping.gesture}>
            <label className="settings-field compact-field">
              <span>Gesture</span>
              <input
                type="text"
                value={mapping.gesture}
                onChange={(event) => {
                  const nextGesture = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    keyMappings: current.keyMappings.map((entry) =>
                      entry.gesture === mapping.gesture
                        ? { ...entry, gesture: nextGesture }
                        : entry,
                    ),
                  }));
                }}
              />
            </label>
            <label className="settings-field compact-field">
              <span>Key</span>
              <input
                type="text"
                value={mapping.key}
                placeholder="Return or Ctrl+Space"
                onChange={(event) =>
                  updateMapping(mapping.gesture, event.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="ghost"
              onClick={() => removeMapping(mapping.gesture)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="hero-actions">
        <button type="button" className="ghost" onClick={addMapping}>
          Add mapping
        </button>
        <button type="button" onClick={() => onSave(draft)}>
          Save settings
        </button>
      </div>
      <p className="panel-copy">
        Primary pinch now clicks on release instead of switching into drag, so
        the learned pose model can be evaluated without drag timing noise.
      </p>
      <p className="panel-copy">
        Adaptive smoothing ignores tiny tremor, then ramps responsiveness up as
        your hand moves farther. Higher values feel faster but can jitter more.
      </p>
      <p className="panel-copy">
        Pointer motion now works like a clutch: hold a closed fist to move the
        cursor, then release into any other pose to freeze it in place. While
        the clutch is held, the cursor follows the tracked hand position
        directly.
      </p>
      <p className="panel-copy">
        Key mappings and workspace shortcuts can use modifier chords such as
        `Ctrl+Space`, `Shift+Tab`, `Ctrl+Alt+Left`, or `Super+K`.
      </p>
      <p className="panel-copy">
        Push-to-talk is a held gesture: Airloom sends key down when the gesture
        starts and key up when it ends. The default pairing is `peace-sign` {"->"}
        `Ctrl+Space`.
      </p>
      <p className="panel-copy">
        Secondary pinch now acts like a transient command mode: centered release
        right-clicks, vertical motion scrolls, and horizontal motion can step
        between workspaces using the shortcuts above.
      </p>
      <p className="panel-copy">
        Pointer margin trims the camera edges out of the active tracking area,
        then stretches the center back to the full screen. Increase it if edge
        jitter is worse than reach.
      </p>
    </section>
  );
};
