import type { AirloomInputEvent } from "@airloom/shared/gesture-events";
import type { AirloomSettings } from "@airloom/shared/settings-schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalibrationPage } from "./pages/calibration";
import { SettingsPage } from "./pages/settings";

type RuntimeState = {
  tracking: boolean;
  gesture: string;
  pinchStrength: number;
  pointerControlEnabled: boolean;
  inputSuppressed: boolean;
  debug: {
    confidence: number;
    brightness: number;
    frameDelayMs: number;
    pose: string;
    poseConfidence: number;
    poseScores: {
      neutral: number;
      "open-palm": number;
      "closed-fist": number;
      "primary-pinch": number;
      "secondary-pinch": number;
    };
    classifierMode: "rules" | "shadow" | "learned";
    modelVersion: string | null;
    learnedPose?: string;
    learnedPoseConfidence?: number;
    shadowDisagreement?: boolean;
    closedFist: boolean;
    closedFistFrames: number;
    closedFistReleaseFrames: number;
    closedFistLatched: boolean;
    openPalmHold: boolean;
    secondaryPinchStrength: number;
  };
  mapper: {
    pointerControlEnabled: boolean;
    primaryPinchActive: boolean;
    primaryPinchHeldMs: number;
    primaryPinchOutcome: "idle" | "click";
  };
  lastError: string | null;
};

type CaptureState = {
  type: "capture.state";
  sessionId: string;
  activeLabel: string;
  recording: boolean;
  takeCount: number;
  counts: {
    neutral: number;
    "open-palm": number;
    "closed-fist": number;
    "primary-pinch": number;
    "secondary-pinch": number;
  };
  lastTakeId: string | null;
  exportPath: string | null;
  message: string | null;
};

type ServiceStatus = {
  running: boolean;
  adapter: string;
  lastEvent: AirloomInputEvent | null;
  runtime: RuntimeState;
  capture: CaptureState;
  debugRecording: {
    recording: boolean;
    sessionPath: string | null;
    frames: number;
    events: number;
  };
  warnings: string[];
};

declare global {
  interface Window {
    airloom: {
      getStatus: () => Promise<ServiceStatus>;
      getSettings: () => Promise<AirloomSettings>;
      updateSettings: (payload: AirloomSettings) => Promise<AirloomSettings>;
      startService: () => Promise<ServiceStatus>;
      stopService: () => Promise<ServiceStatus>;
      setInputSuppressed: (suppressed: boolean) => Promise<ServiceStatus>;
      setCaptureLabel: (label: string) => Promise<ServiceStatus>;
      startCapture: () => Promise<ServiceStatus>;
      stopCapture: () => Promise<ServiceStatus>;
      discardLastCapture: () => Promise<ServiceStatus>;
      exportCaptures: () => Promise<ServiceStatus>;
      startDebugRecording: () => Promise<ServiceStatus>;
      stopDebugRecording: () => Promise<ServiceStatus>;
      sendEvent: (payload: AirloomInputEvent) => Promise<ServiceStatus>;
      onStatus: (listener: (value: ServiceStatus) => void) => () => void;
      onPreviewFrame: (listener: (value: Uint8Array) => void) => () => void;
    };
  }
}

const initialStatus: ServiceStatus = {
  running: false,
  adapter: "unknown",
  lastEvent: null,
  runtime: {
    tracking: false,
    gesture: "idle",
    pinchStrength: 0,
    pointerControlEnabled: false,
    inputSuppressed: false,
    debug: {
      confidence: 0,
      brightness: 0,
      frameDelayMs: 0,
      pose: "unknown",
      poseConfidence: 0,
      poseScores: {
        neutral: 0,
        "open-palm": 0,
        "closed-fist": 0,
        "primary-pinch": 0,
        "secondary-pinch": 0,
      },
      classifierMode: "learned",
      modelVersion: null,
      closedFist: false,
      closedFistFrames: 0,
      closedFistReleaseFrames: 0,
      closedFistLatched: false,
      openPalmHold: false,
      secondaryPinchStrength: 0,
    },
    mapper: {
      pointerControlEnabled: false,
      primaryPinchActive: false,
      primaryPinchHeldMs: 0,
      primaryPinchOutcome: "idle",
    },
    lastError: null,
  },
  capture: {
    type: "capture.state",
    sessionId: "pending",
    activeLabel: "neutral",
    recording: false,
    takeCount: 0,
    counts: {
      neutral: 0,
      "open-palm": 0,
      "closed-fist": 0,
      "primary-pinch": 0,
      "secondary-pinch": 0,
    },
    lastTakeId: null,
    exportPath: null,
    message: null,
  },
  debugRecording: {
    recording: false,
    sessionPath: null,
    frames: 0,
    events: 0,
  },
  warnings: [],
};

const defaultSettings: AirloomSettings = {
  smoothing: 0.5,
  clickPinchThreshold: 0.78,
  dragHoldThresholdMs: 220,
  rightClickGesture: "thumb-middle-pinch",
  keyMappings: [{ gesture: "open-palm-hold", key: "Return" }],
};

const formatEventLogEntry = (event: AirloomInputEvent) => {
  switch (event.type) {
    case "gesture.intent":
      return `intent ${event.gesture} ${event.phase}`;
    case "pointer.observed":
      return `pointer ${event.x.toFixed(2)},${event.y.toFixed(2)} conf=${event.confidence.toFixed(2)}`;
    case "capture.state":
      return `capture ${event.recording ? "recording" : "idle"} label=${event.activeLabel} takes=${event.takeCount}`;
    case "debug.frame":
      return `preview ${event.width}x${event.height}`;
    case "status": {
      const debug = event.debug;
      if (!debug) {
        return `status gesture=${event.gesture}`;
      }

      return [
        `status gesture=${event.gesture}`,
        `pose=${debug.pose}`,
        `delay=${debug.frameDelayMs}ms`,
        `fist=${debug.closedFistFrames}`,
        `release=${debug.closedFistReleaseFrames}`,
        `latched=${debug.closedFistLatched ? "yes" : "no"}`,
      ].join(" | ");
    }
  }
};

export const App = () => {
  const [status, setStatus] = useState(initialStatus);
  const [settings, setSettings] = useState(defaultSettings);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"calibration" | "settings">(
    "calibration",
  );
  const lastEventKeyRef = useRef<string | null>(null);
  const eventLogRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    window.airloom.getStatus().then(setStatus).catch(console.error);
    window.airloom.getSettings().then(setSettings).catch(console.error);
    return window.airloom.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus.lastEvent === null) {
        return;
      }

      const eventKey = JSON.stringify(nextStatus.lastEvent);
      if (eventKey === lastEventKeyRef.current) {
        return;
      }

      lastEventKeyRef.current = eventKey;
      setEventLog((current) =>
        [...current, formatEventLogEntry(nextStatus.lastEvent)].slice(-80),
      );
    });
  }, []);

  const lastEventLabel = useMemo(() => {
    if (eventLog.length === 0) {
      return "No events yet";
    }

    return eventLog.join("\n");
  }, [eventLog]);

  useEffect(() => {
    if (eventLogRef.current === null) {
      return;
    }

    eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
  });

  const sendMockEvent = async (event: AirloomInputEvent) => {
    const nextStatus = await window.airloom.sendEvent(event);
    setStatus(nextStatus);
  };

  const sendMockEvents = async (events: AirloomInputEvent[]) => {
    for (const event of events) {
      const nextStatus = await window.airloom.sendEvent(event);
      setStatus(nextStatus);
    }
  };

  const saveSettings = async (nextSettings: AirloomSettings) => {
    const saved = await window.airloom.updateSettings(nextSettings);
    setSettings(saved);
  };

  return (
    <main className="shell">
      <section className="hero panel">
        <div>
          <div className="eyebrow">Airloom</div>
          <h1>Gesture control for the rest of your desktop.</h1>
          <p>
            Linux-first webcam control with a replayable Python gesture engine
            and a focused Electron shell.
          </p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            onClick={() => window.airloom.startService().then(setStatus)}
          >
            Start service
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => window.airloom.stopService().then(setStatus)}
          >
            Stop service
          </button>
        </div>
      </section>

      <section className="dashboard">
        <div className="dashboard-main">
          <div className="panel status-panel">
            <div className="eyebrow">Runtime</div>
            <h2>
              {status.running
                ? "Vision service online"
                : "Vision service offline"}
            </h2>
            <div className="metric-grid compact">
              <div className="metric-card">
                <span>Adapter</span>
                <strong>{status.adapter}</strong>
              </div>
              <div className="metric-card">
                <span>Tracking</span>
                <strong>{status.runtime.tracking ? "Yes" : "No"}</strong>
              </div>
              <div className="metric-card">
                <span>Pointer</span>
                <strong>
                  {status.runtime.pointerControlEnabled ? "Armed" : "Frozen"}
                </strong>
              </div>
              <div className="metric-card">
                <span>Gesture</span>
                <strong>{status.runtime.gesture}</strong>
              </div>
            </div>
            {status.warnings.map((warning) => (
              <p className="warning-text" key={warning}>
                {warning}
              </p>
            ))}
            {status.runtime.lastError ? (
              <p className="error-text">{status.runtime.lastError}</p>
            ) : null}
          </div>

          <div className="panel control-panel">
            <div className="eyebrow">Debug</div>
            <h2>Trigger mock actions</h2>
            <div className="mock-grid">
            <button
              type="button"
              onClick={() =>
                sendMockEvent({
                  type: "gesture.intent",
                  gesture: "closed-fist",
                  phase: "instant",
                })
              }
            >
              Toggle pointer
            </button>
            <button
              type="button"
              onClick={() =>
                sendMockEvent({
                  type: "pointer.observed",
                  x: 0.62,
                  y: 0.42,
                  confidence: 0.91,
                })
              }
            >
              Move pointer
            </button>
            <button
              type="button"
              onClick={() =>
                sendMockEvents([
                  {
                    type: "gesture.intent",
                    gesture: "primary-pinch",
                    phase: "start",
                  },
                  {
                    type: "gesture.intent",
                    gesture: "primary-pinch",
                    phase: "end",
                  },
                ])
              }
            >
              Left click
            </button>
            <button
              type="button"
              onClick={() =>
                sendMockEvent({
                  type: "gesture.intent",
                  gesture: "thumb-middle-pinch",
                  phase: "instant",
                })
              }
            >
              Right click
            </button>
            <button
              type="button"
              onClick={() =>
                sendMockEvent({
                  type: "gesture.intent",
                  gesture: "open-palm-hold",
                  phase: "instant",
                })
              }
            >
              Trigger mapped key
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                sendMockEvent({
                  type: "status",
                  tracking: true,
                  pinchStrength: 0.83,
                  gesture: "short-pinch",
                })
              }
            >
              Status: pinch
            </button>
            </div>
          </div>
        </div>

        <aside className="panel event-log-panel">
          <div>
            <div className="eyebrow">Trace</div>
            <h2>Event log</h2>
            <p className="panel-copy">
              New events stay pinned to the bottom so you can watch fist latching
              and frame delay while testing live gestures.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                onClick={() =>
                  (status.debugRecording.recording
                    ? window.airloom.stopDebugRecording()
                    : window.airloom.startDebugRecording()
                  ).then(setStatus)
                }
              >
                {status.debugRecording.recording
                  ? "Stop debug recording"
                  : "Record preview + debug"}
              </button>
            </div>
            <div className="metric-grid compact">
              <div className="metric-card">
                <span>Recorder</span>
                <strong>
                  {status.debugRecording.recording ? "Recording" : "Idle"}
                </strong>
              </div>
              <div className="metric-card">
                <span>Frames</span>
                <strong>{status.debugRecording.frames}</strong>
              </div>
              <div className="metric-card">
                <span>Events</span>
                <strong>{status.debugRecording.events}</strong>
              </div>
            </div>
            {status.debugRecording.sessionPath ? (
              <p className="panel-copy monospace recording-path">
                {status.debugRecording.sessionPath}
              </p>
            ) : null}
          </div>
          <pre ref={eventLogRef} className="panel-copy monospace event-log">
            {lastEventLabel}
          </pre>
        </aside>
      </section>

      <section className="tabs">
        <button
          type="button"
          className={activeTab === "calibration" ? "active-tab" : "ghost"}
          onClick={() => setActiveTab("calibration")}
        >
          Calibration
        </button>
        <button
          type="button"
          className={activeTab === "settings" ? "active-tab" : "ghost"}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
      </section>

      {activeTab === "calibration" ? (
        <CalibrationPage
          serviceRunning={status.running}
          tracking={status.runtime.tracking}
          gesture={status.runtime.gesture}
          pinchStrength={status.runtime.pinchStrength}
          pointerControlEnabled={status.runtime.pointerControlEnabled}
          debug={status.runtime.debug}
          capture={status.capture}
          onCaptureLabelChange={(label) =>
            window.airloom.setCaptureLabel(label).then(setStatus)
          }
          onCaptureStart={() => window.airloom.startCapture().then(setStatus)}
          onCaptureStop={() => window.airloom.stopCapture().then(setStatus)}
          onDiscardLastCapture={() =>
            window.airloom.discardLastCapture().then(setStatus)
          }
          onExportCaptures={() => window.airloom.exportCaptures().then(setStatus)}
          primaryPinchActive={status.runtime.mapper.primaryPinchActive}
          primaryPinchHeldMs={status.runtime.mapper.primaryPinchHeldMs}
          primaryPinchOutcome={status.runtime.mapper.primaryPinchOutcome}
        />
      ) : (
        <SettingsPage settings={settings} onSave={saveSettings} />
      )}
    </main>
  );
};
