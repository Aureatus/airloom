import type { AirloomSettings } from "@incantation/shared/settings-schema";
import { type ReactNode, useEffect, useState } from "react";

type SettingsPageProps = {
  settings: AirloomSettings;
  onSave: (settings: AirloomSettings) => Promise<void>;
};

type SettingsSectionProps = {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
};

const SettingsSection = ({
  eyebrow,
  title,
  copy,
  children,
}: SettingsSectionProps) => {
  return (
    <section className="settings-section-card">
      <div className="settings-section-header">
        <div className="eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        <p className="panel-copy">{copy}</p>
      </div>
      {children}
    </section>
  );
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
    <section className="panel settings-shell">
      <div className="settings-banner">
        <div>
          <div className="eyebrow">Incantation</div>
          <h2>Bindings and thresholds</h2>
          <p className="panel-copy">
            Tune the clutch, command mode, overlays, and spoken input without
            digging through one flat wall of controls.
          </p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setDraft(settings)}
          >
            Revert draft
          </button>
          <button type="button" onClick={() => onSave(draft)}>
            Save changes
          </button>
        </div>
      </div>

      <div className="mapping-list settings-spellbook">
        <div className="mapping-row">
          <span>Pointer clutch</span>
          <strong>Hold closed fist</strong>
        </div>
        <div className="mapping-row">
          <span>Left click / drag</span>
          <strong>Primary pinch</strong>
        </div>
        <div className="mapping-row">
          <span>Command mode</span>
          <strong>Secondary pinch hold</strong>
        </div>
        <div className="mapping-row">
          <span>Push to talk</span>
          <strong>
            {draft.pushToTalkGesture} {"->"} {draft.pushToTalkKey}
          </strong>
        </div>
      </div>

      <div className="settings-stack">
        <SettingsSection
          eyebrow="Tracking"
          title="Pointer clutch"
          copy="Shape how your primary hand glides, steadies, and commits to a deliberate drag."
        >
          <div className="settings-grid settings-grid-wide">
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
              <span>Drag hold (ms)</span>
              <input
                type="number"
                min="0"
                max="2000"
                step="10"
                value={draft.dragHoldThresholdMs}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dragHoldThresholdMs: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          eyebrow="Command Mode"
          title="Secondary pinch behavior"
          copy="Tune how command mode decides between right click, scroll, and workspace stepping."
        >
          <div className="settings-grid settings-grid-wide">
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
          </div>
        </SettingsSection>

        <SettingsSection
          eyebrow="Overlays"
          title="Overlay placement"
          copy="Choose where the floating command and camera overlays rest while you work."
        >
          <div className="settings-grid">
            <label className="settings-field">
              <span>Command HUD position</span>
              <select
                value={draft.commandHudPosition}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    commandHudPosition: event.target
                      .value as AirloomSettings["commandHudPosition"],
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
                    cameraHudPosition: event.target
                      .value as AirloomSettings["cameraHudPosition"],
                  }))
                }
              >
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          eyebrow="Voice"
          title="Push-to-talk"
          copy="Hold this pose to press and hold your system speech shortcut."
        >
          <div className="settings-grid">
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
        </SettingsSection>

        <SettingsSection
          eyebrow="Bindings"
          title="Custom mappings"
          copy="Map additional gestures to key chords without losing the defaults."
        >
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
          </div>
        </SettingsSection>

        <SettingsSection
          eyebrow="Legacy"
          title="Compatibility"
          copy="Keep older gesture names readable while command mode remains the default path."
        >
          <div className="settings-grid">
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
          </div>
        </SettingsSection>
      </div>

      <div className="settings-footer-copy">
        <p className="panel-copy">
          Modifier chords such as `Ctrl+Space`, `Ctrl+Alt+Left`, and `Super+K`
          are valid in every key field.
        </p>
        <p className="panel-copy">
          Secondary pinch now acts like command mode: release in the center for
          a right click, move vertically to scroll, and move horizontally to
          step between workspaces.
        </p>
      </div>
    </section>
  );
};
