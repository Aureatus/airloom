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
          <strong>Index motion</strong>
        </div>
        <div className="mapping-row">
          <span>Left click</span>
          <strong>Primary pinch</strong>
        </div>
        <div className="mapping-row">
          <span>Right click</span>
          <strong>{draft.rightClickGesture}</strong>
        </div>
        <div className="mapping-row">
          <span>Mapped keybind</span>
          <strong>Open palm hold</strong>
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
          <span>Right click gesture</span>
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
        cursor, then release into any other pose to freeze it in place.
      </p>
    </section>
  );
};
