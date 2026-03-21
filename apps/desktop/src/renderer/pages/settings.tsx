import type { AirloomSettings } from "@incantation/shared/settings-schema";
import { type ReactNode, useEffect, useState } from "react";

type QuestBridgeStatus = {
  enabled: boolean;
  port: number;
  recommendedUrl: string | null;
  candidateUrls: string[];
  desktopSelfTestUrl: string;
  smokeTestCommand: string;
  httpsReady: boolean;
  certificateMode: "manual" | "auto" | "none";
  warnings: string[];
};

type SettingsPageProps = {
  settings: AirloomSettings;
  serviceRunning: boolean;
  questBridge: QuestBridgeStatus;
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

export const SettingsPage = ({
  settings,
  serviceRunning,
  questBridge,
  onSave,
}: SettingsPageProps) => {
  const [draft, setDraft] = useState(settings);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(`${label} copied`);
      window.setTimeout(() => setCopyFeedback(null), 1600);
    } catch {
      setCopyFeedback(`Could not copy ${label.toLowerCase()}`);
      window.setTimeout(() => setCopyFeedback(null), 1600);
    }
  };

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
          <span>Direct scroll</span>
          <strong>Blade hand</strong>
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
          eyebrow="Backend"
          title="Tracking source"
          copy="Choose the live hand-tracking backend. Webcam stays the stable default; Leap and Quest Bridge are both experimental Linux/X11 paths."
        >
          <div className="settings-grid settings-grid-wide">
            <label className="settings-field">
              <span>Tracking backend</span>
              <select
                value={draft.trackingBackend}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    trackingBackend: event.target
                      .value as AirloomSettings["trackingBackend"],
                  }))
                }
              >
                <option value="webcam">Webcam</option>
                <option value="leap">Leap Motion Controller</option>
                <option value="quest-bridge">Meta Quest Bridge</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Leap orientation</span>
              <select
                value={draft.leapOrientation}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    leapOrientation: event.target
                      .value as AirloomSettings["leapOrientation"],
                  }))
                }
                disabled={draft.trackingBackend !== "leap"}
              >
                <option value="normal">Normal</option>
                <option value="inverted">Inverted</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Quest bridge port</span>
              <input
                type="number"
                min="1024"
                max="65535"
                value={draft.questBridgePort}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    questBridgePort: Number(event.target.value),
                  }))
                }
                disabled={draft.trackingBackend !== "quest-bridge"}
              />
            </label>
            <label className="settings-field">
              <span>Quest pointer hand</span>
              <select
                value={draft.questPointerHand}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    questPointerHand: event.target
                      .value as AirloomSettings["questPointerHand"],
                  }))
                }
                disabled={draft.trackingBackend !== "quest-bridge"}
              >
                <option value="auto">Auto</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Quest action hand</span>
              <select
                value={draft.questActionHand}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    questActionHand: event.target
                      .value as AirloomSettings["questActionHand"],
                  }))
                }
                disabled={draft.trackingBackend !== "quest-bridge"}
              >
                <option value="auto">Auto</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="settings-field checkbox-field">
              <span>Require Quest clutch</span>
              <input
                type="checkbox"
                checked={draft.questRequirePointerClutch}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    questRequirePointerClutch: event.target.checked,
                  }))
                }
                disabled={draft.trackingBackend !== "quest-bridge"}
              />
            </label>
          </div>
          <p className="panel-copy">
            Incantation applies this automatically through the Ultraleap service
            when the Leap backend starts, so you should not need to run `leapctl
            config orientation` by hand.
          </p>
          {draft.trackingBackend === "quest-bridge" ? (
            <div className="quest-guide">
              <p className="panel-copy">
                Start the service, then open the Quest page shown here. The
                headset streams hand landmarks into the existing desktop mapper,
                so your Linux X11 path and push-to-talk flow stay unchanged.
              </p>
              <div className="metric-grid compact">
                <div className="metric-card">
                  <span>Service</span>
                  <strong>{serviceRunning ? "running" : "stopped"}</strong>
                </div>
                <div className="metric-card">
                  <span>HTTPS</span>
                  <strong>
                    {questBridge.httpsReady ? "ready" : "missing"}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Certificate</span>
                  <strong>{questBridge.certificateMode}</strong>
                </div>
              </div>
              <div className="hero-actions quest-guide-actions">
                {questBridge.recommendedUrl ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      if (questBridge.recommendedUrl) {
                        void copyValue(questBridge.recommendedUrl, "Quest URL");
                      }
                    }}
                  >
                    Copy Quest URL
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    void copyValue(
                      questBridge.smokeTestCommand,
                      "smoke command",
                    )
                  }
                >
                  Copy smoke command
                </button>
              </div>
              {copyFeedback ? (
                <p className="panel-copy">{copyFeedback}</p>
              ) : null}
              <div className="quest-url-list monospace">
                {questBridge.recommendedUrl ? (
                  <div>Quest URL: {questBridge.recommendedUrl}</div>
                ) : (
                  <div>
                    No LAN URL detected yet. Connect the laptop to Wi-Fi first.
                  </div>
                )}
                <div>Desktop self-test: {questBridge.desktopSelfTestUrl}</div>
                <div>Smoke command: {questBridge.smokeTestCommand}</div>
                {questBridge.candidateUrls.slice(1).map((url) => (
                  <div key={url}>Alternate URL: {url}</div>
                ))}
              </div>
              <div className="quest-checklist">
                <div className="quest-checklist-item">
                  <strong>1.</strong> Save settings and press `Start service`.
                </div>
                <div className="quest-checklist-item">
                  <strong>2.</strong> Run `bun run test:quest` on the laptop to
                  confirm the bridge answers locally.
                </div>
                <div className="quest-checklist-item">
                  <strong>3.</strong> In Quest Browser, open the Quest URL shown
                  above.
                </div>
                <div className="quest-checklist-item">
                  <strong>4.</strong> If Quest shows a certificate warning,
                  choose `Advanced` then continue.
                </div>
                <div className="quest-checklist-item">
                  <strong>5.</strong> Open the Calibration tab and wait for
                  `Bridge link = connected` and `Hands tracked &gt; 0`.
                </div>
              </div>
              {questBridge.warnings.map((warning) => (
                <p className="warning-text" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection
          eyebrow="Tracking"
          title="Pointer clutch"
          copy="Shape how your primary hand glides and steadies while the action hand handles click and clutch-driven drag."
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
              <span>Drag start deadzone</span>
              <input
                type="number"
                min="0"
                max="0.1"
                step="0.001"
                value={draft.dragStartDeadzone}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dragStartDeadzone: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          eyebrow="Command Mode"
          title="Secondary pinch behavior"
          copy="Command mode is parked for now. Secondary pinch currently fires a direct right click because laptop webcam release tracking is too shaky, and the floating command HUD is hidden until we revisit it."
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
              <span>Middle-click tap (ms)</span>
              <input
                type="number"
                min="0"
                max="1000"
                step="10"
                value={draft.commandModeMiddleClickTapMs}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    commandModeMiddleClickTapMs: Number(event.target.value),
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
          eyebrow="Scroll"
          title="Blade hand behavior"
          copy="Use a fingers-together flat hand for direct vertical scrolling without going through command mode."
        >
          <div className="settings-grid settings-grid-wide">
            <label className="settings-field">
              <span>Enable blade-hand scroll</span>
              <input
                type="checkbox"
                checked={draft.bladeHandScrollEnabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bladeHandScrollEnabled: event.target.checked,
                  }))
                }
              />
            </label>
            <label className="settings-field">
              <span>Scroll deadzone</span>
              <input
                type="number"
                min="0"
                max="0.1"
                step="0.001"
                value={draft.bladeHandScrollDeadzone}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bladeHandScrollDeadzone: Number(event.target.value),
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
                value={draft.bladeHandScrollGain}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bladeHandScrollGain: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="settings-field">
              <span>Activation frames</span>
              <input
                type="number"
                min="1"
                max="12"
                step="1"
                value={draft.bladeHandScrollActivationFrames}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bladeHandScrollActivationFrames: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="settings-field">
              <span>Release frames</span>
              <input
                type="number"
                min="1"
                max="12"
                step="1"
                value={draft.bladeHandScrollReleaseFrames}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bladeHandScrollReleaseFrames: Number(event.target.value),
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
          Secondary pinch now fires right click directly on activation. The
          command-mode tuning fields stay here so we can revisit them once the
          active tracking backend is steadier.
        </p>
      </div>
    </section>
  );
};
