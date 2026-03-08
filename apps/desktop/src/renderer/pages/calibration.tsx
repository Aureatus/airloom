import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LivePreview } from "../components/live-preview";

const captureLabels = [
  "neutral",
  "open-palm",
  "closed-fist",
  "primary-pinch",
  "secondary-pinch",
  "peace-sign",
] as const;

const captureDurationOptions = [1000, 1500, 2000, 2500] as const;

const labelHotkeys: Record<(typeof captureLabels)[number], string> = {
  neutral: "a",
  "open-palm": "s",
  "closed-fist": "d",
  "primary-pinch": "f",
  "secondary-pinch": "g",
  "peace-sign": "h",
};

const durationHotkeys: Record<number, string> = {
  1000: "1",
  1500: "2",
  2000: "3",
  2500: "4",
};

const randomSandboxTarget = () => ({
  x: 10 + Math.random() * 70,
  y: 10 + Math.random() * 70,
});

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
};

const handSideLabel = (value?: string) => {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("left")) {
    return "left";
  }
  if (normalized.includes("right")) {
    return "right";
  }
  return null;
};

type CalibrationProps = {
  serviceRunning: boolean;
  tracking: boolean;
  gesture: string;
  pinchStrength: number;
  pointerControlEnabled: boolean;
  pushToTalkGesture: string;
  pushToTalkKey: string;
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
      "peace-sign": number;
    };
    classifierMode: "rules" | "shadow" | "learned";
    modelVersion: string | null;
    learnedPose?: string;
    learnedPoseConfidence?: number;
    shadowDisagreement?: boolean;
    actionPose?: string;
    actionPoseConfidence?: number;
    actionPoseScores?: {
      neutral: number;
      "open-palm": number;
      "closed-fist": number;
      "primary-pinch": number;
      "secondary-pinch": number;
      "peace-sign": number;
    };
    closedFist: boolean;
    closedFistFrames: number;
    closedFistReleaseFrames: number;
    closedFistLatched: boolean;
    openPalmHold: boolean;
    secondaryPinchStrength: number;
    pointerHand?: string;
    actionHand?: string;
    fallbackReason?: string;
  };
  capture: {
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
      "peace-sign": number;
    };
    lastTakeId: string | null;
    exportPath: string | null;
    message: string | null;
  };
  onCaptureLabelChange: (label: string) => Promise<unknown>;
  onCaptureStart: () => Promise<unknown>;
  onCaptureStop: () => Promise<unknown>;
  onDiscardLastCapture: () => Promise<unknown>;
  onExportCaptures: () => Promise<unknown>;
  primaryPinchActive: boolean;
  primaryPinchHeldMs: number;
  primaryPinchOutcome: "idle" | "click" | "drag";
};

export const CalibrationPage = ({
  serviceRunning,
  tracking,
  gesture,
  pinchStrength,
  pointerControlEnabled,
  pushToTalkGesture,
  pushToTalkKey,
  debug,
  capture,
  onCaptureLabelChange,
  onCaptureStart,
  onCaptureStop,
  onDiscardLastCapture,
  onExportCaptures,
  primaryPinchActive,
  primaryPinchHeldMs,
  primaryPinchOutcome,
}: CalibrationProps) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const captureStartRef = useRef(onCaptureStart);
  const captureStopRef = useRef(onCaptureStop);
  const discardLastRef = useRef(onDiscardLastCapture);
  const exportCapturesRef = useRef(onExportCaptures);
  const changeLabelRef = useRef(onCaptureLabelChange);
  const [captureDurationMs, setCaptureDurationMs] = useState<number>(1500);
  const [sandboxHits, setSandboxHits] = useState(0);
  const [sandboxMisses, setSandboxMisses] = useState(0);
  const [sandboxTarget, setSandboxTarget] = useState(randomSandboxTarget);
  const [speechDraft, setSpeechDraft] = useState(
    "Focus here, then hold your speech gesture and dictate a short sentence.",
  );
  const progress = Math.min(primaryPinchHeldMs / 450, 1);
  const sandboxAttempts = sandboxHits + sandboxMisses;
  const sandboxAccuracy =
    sandboxAttempts === 0 ? 0 : Math.round((sandboxHits / sandboxAttempts) * 100);
  const actionPoseScores = debug.actionPoseScores ?? debug.poseScores;
  const pointerSide = handSideLabel(debug.pointerHand);
  const actionSide = handSideLabel(debug.actionHand);
  const pointerPanelClassName = [
    "hand-debug-panel",
    "hand-debug-panel-pointer",
    pointerSide === "right" ? "hand-debug-panel-right" : "",
    pointerSide === "left" ? "hand-debug-panel-left" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const actionPanelClassName = [
    "hand-debug-panel",
    "hand-debug-panel-action",
    actionSide === "right" ? "hand-debug-panel-right" : "",
    actionSide === "left" ? "hand-debug-panel-left" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const brightnessLabel = useMemo(() => {
    if (debug.brightness < 0.18) {
      return "Very dark";
    }

    if (debug.brightness < 0.3) {
      return "Dim";
    }

    if (debug.brightness < 0.55) {
      return "Usable";
    }

    return "Bright";
  }, [debug.brightness]);

  useEffect(() => {
    captureStartRef.current = onCaptureStart;
  }, [onCaptureStart]);

  useEffect(() => {
    captureStopRef.current = onCaptureStop;
  }, [onCaptureStop]);

  useEffect(() => {
    discardLastRef.current = onDiscardLastCapture;
  }, [onDiscardLastCapture]);

  useEffect(() => {
    exportCapturesRef.current = onExportCaptures;
  }, [onExportCaptures]);

  useEffect(() => {
    changeLabelRef.current = onCaptureLabelChange;
  }, [onCaptureLabelChange]);

  useEffect(() => {
    return () => {
      void window.airloom.setInputSuppressed(false);
    };
  }, []);

  useEffect(() => {
    if (countdown === null) {
      return;
    }
    if (countdown <= 0) {
      captureStartRef.current()
        .catch(() => window.airloom.setInputSuppressed(false))
        .finally(() => {
          setCountdown(null);
          setCaptureBusy(false);
        });
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!capture.recording) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCaptureBusy(true);
      captureStopRef.current()
        .finally(() => window.airloom.setInputSuppressed(false))
        .finally(() => setCaptureBusy(false));
    }, captureDurationMs);

    return () => window.clearTimeout(timer);
  }, [capture.recording, captureDurationMs]);

  const startCapture = useCallback(async () => {
    setCaptureBusy(true);
    await window.airloom.setInputSuppressed(true);
    setCountdown(3);
  }, []);

  const stopCapture = useCallback(async () => {
    setCaptureBusy(true);
    await onCaptureStop();
    await window.airloom.setInputSuppressed(false);
    setCaptureBusy(false);
  }, [onCaptureStop]);

  const resetSandbox = useCallback(() => {
    setSandboxHits(0);
    setSandboxMisses(0);
    setSandboxTarget(randomSandboxTarget());
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "escape") {
        if (countdown !== null) {
          event.preventDefault();
          setCountdown(null);
          setCaptureBusy(false);
          void window.airloom.setInputSuppressed(false);
          return;
        }

        if (capture.recording && !captureBusy) {
          event.preventDefault();
          void stopCapture();
        }
        return;
      }

      const labelEntry = Object.entries(labelHotkeys).find(([, hotkey]) => hotkey === key);
      if (labelEntry && !capture.recording && !captureBusy && countdown === null) {
        event.preventDefault();
        void changeLabelRef.current(labelEntry[0]);
        return;
      }

      const durationEntry = Object.entries(durationHotkeys).find(([, hotkey]) => hotkey === key);
      if (durationEntry && !capture.recording && !captureBusy && countdown === null) {
        event.preventDefault();
        setCaptureDurationMs(Number(durationEntry[0]));
        return;
      }

      if (key === " " || key === "enter") {
        event.preventDefault();
        if (!serviceRunning || captureBusy) {
          return;
        }
        if (countdown !== null) {
          setCountdown(null);
          setCaptureBusy(false);
          void window.airloom.setInputSuppressed(false);
          return;
        }
        if (capture.recording) {
          void stopCapture();
          return;
        }
        void startCapture();
        return;
      }

      if (key === "backspace" && !capture.recording && !captureBusy && capture.takeCount > 0) {
        event.preventDefault();
        setCaptureBusy(true);
        void discardLastRef.current().finally(() => setCaptureBusy(false));
        return;
      }

      if (key === "e" && !capture.recording && !captureBusy && capture.takeCount > 0) {
        event.preventDefault();
        setCaptureBusy(true);
        void exportCapturesRef.current().finally(() => setCaptureBusy(false));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [capture.recording, capture.takeCount, captureBusy, countdown, serviceRunning, startCapture, stopCapture]);

  return (
    <section className="panel">
      <div className="eyebrow">Calibration</div>
      <h2>Live gesture signal</h2>
      <div className="calibration-layout">
        <div className="calibration-main">
          <div className="metric-grid calibration-summary-grid">
            <div className="metric-card">
              <span>Tracking</span>
              <strong>{tracking ? "Active" : "Searching"}</strong>
            </div>
            <div className="metric-card">
              <span>Gesture</span>
              <strong>{gesture}</strong>
            </div>
            <div className="metric-card">
              <span>Pointer</span>
              <strong>{pointerControlEnabled ? "Hold-to-move" : "Frozen"}</strong>
            </div>
            <div className="metric-card">
              <span>Confidence</span>
              <strong>{debug.confidence.toFixed(2)}</strong>
            </div>
            <div className="metric-card">
              <span>Scene light</span>
              <strong>
                {brightnessLabel} ({debug.brightness.toFixed(2)})
              </strong>
            </div>
            <div className="metric-card">
              <span>Frame delay</span>
              <strong>{debug.frameDelayMs} ms</strong>
            </div>
            <div className="metric-card">
              <span>Classifier</span>
              <strong>{debug.classifierMode}</strong>
            </div>
            <div className="metric-card">
              <span>Model</span>
              <strong>{debug.modelVersion ?? "rules only"}</strong>
            </div>
          </div>

          <div className="hand-debug-sections">
            <section className={pointerPanelClassName}>
              <div className="hand-debug-header">
                <div>
                  <div className="eyebrow">Pointer side</div>
                  <h3>{pointerSide === "right" ? "Right hand" : pointerSide === "left" ? "Left hand" : "Pointer hand"}</h3>
                </div>
                <div className="hand-debug-chip">Pointer · {debug.pointerHand ?? "unknown"}</div>
              </div>
              <div className="metric-grid hand-debug-grid">
                <div className="metric-card">
                  <span>Pose</span>
                  <strong>
                    {debug.pose} ({debug.poseConfidence.toFixed(2)})
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Primary</span>
                  <strong>{debug.poseScores["primary-pinch"].toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Fist</span>
                  <strong>{debug.poseScores["closed-fist"].toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Palm</span>
                  <strong>{debug.poseScores["open-palm"].toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Peace</span>
                  <strong>{(debug.poseScores["peace-sign"] ?? 0).toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Neutral</span>
                  <strong>{debug.poseScores.neutral.toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Closed fist</span>
                  <strong>{debug.closedFist ? "Seen" : "No"}</strong>
                </div>
                <div className="metric-card">
                  <span>Fist frames</span>
                  <strong>{debug.closedFistFrames}</strong>
                </div>
                <div className="metric-card">
                  <span>Fist latched</span>
                  <strong>{debug.closedFistLatched ? "Yes" : "No"}</strong>
                </div>
              </div>
            </section>

            <section className={actionPanelClassName}>
              <div className="hand-debug-header">
                <div>
                  <div className="eyebrow">Action side</div>
                  <h3>{actionSide === "right" ? "Right hand" : actionSide === "left" ? "Left hand" : "Action hand"}</h3>
                </div>
                <div className="hand-debug-chip">Action · {debug.actionHand ?? "unknown"}</div>
              </div>
              <div className="metric-grid hand-debug-grid">
                <div className="metric-card">
                  <span>Pose</span>
                  <strong>
                    {debug.actionPose ?? debug.pose} ({(
                      debug.actionPoseConfidence ?? debug.poseConfidence
                    ).toFixed(2)})
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Primary</span>
                  <strong>{actionPoseScores["primary-pinch"].toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Secondary</span>
                  <strong>{debug.secondaryPinchStrength.toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Palm</span>
                  <strong>{actionPoseScores["open-palm"].toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Peace</span>
                  <strong>{(actionPoseScores["peace-sign"] ?? 0).toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Neutral</span>
                  <strong>{actionPoseScores.neutral.toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Pinch</span>
                  <strong>{pinchStrength.toFixed(2)}</strong>
                </div>
                <div className="metric-card">
                  <span>Open palm</span>
                  <strong>{debug.openPalmHold ? "Seen" : "No"}</strong>
                </div>
                <div className="metric-card">
                  <span>Click preview</span>
                  <strong>{primaryPinchOutcome}</strong>
                </div>
              </div>
            </section>
          </div>

          <div className="metric-grid calibration-summary-grid">
            <div className="metric-card">
              <span>Fist release</span>
              <strong>{debug.closedFistReleaseFrames}</strong>
            </div>
            <div className="metric-card">
              <span>Pinch hold</span>
              <strong>{primaryPinchHeldMs} ms</strong>
            </div>
            <div className="metric-card">
              <span>Hold active</span>
              <strong>{primaryPinchActive ? "Yes" : "No"}</strong>
            </div>
            {debug.learnedPose ? (
              <div className="metric-card">
                <span>Learned pose</span>
                <strong>
                  {debug.learnedPose} ({(debug.learnedPoseConfidence ?? 0).toFixed(2)})
                </strong>
              </div>
            ) : null}
            {debug.shadowDisagreement !== undefined ? (
              <div className="metric-card">
                <span>Shadow mismatch</span>
                <strong>{debug.shadowDisagreement ? "Yes" : "No"}</strong>
              </div>
            ) : null}
            {debug.fallbackReason ? (
              <div className="metric-card">
                <span>Fallback</span>
                <strong>{debug.fallbackReason}</strong>
              </div>
            ) : null}
          </div>
          <p className="panel-copy">
            Cursor motion is frozen unless you actively hold a closed fist. Open
            palm and pinch gestures keep the cursor parked in place while they fire.
          </p>
          <p className="panel-copy">
            If scene light stays in the dim range or confidence drops while your
            hand is clearly visible, low light is probably hurting detection.
          </p>
          <p className="panel-copy">
            If a pinch feels ignored, compare the primary score against the fist,
            palm, and neutral scores to see which pose the classifier nearly chose.
          </p>

          <div className="panel-copy">
            <strong>Capture dataset</strong>
          </div>
          <div className="metric-grid compact">
            <div className="metric-card">
              <span>Session</span>
              <strong>{capture.sessionId}</strong>
            </div>
            <div className="metric-card">
              <span>Active label</span>
              <strong>{capture.activeLabel}</strong>
            </div>
            <div className="metric-card">
              <span>Takes</span>
              <strong>{capture.takeCount}</strong>
            </div>
            <div className="metric-card">
              <span>Recording</span>
              <strong>
                {capture.recording ? "Yes" : countdown ? `Countdown (${countdown})` : "No"}
              </strong>
            </div>
            <div className="metric-card">
              <span>Auto-stop</span>
              <strong>{(captureDurationMs / 1000).toFixed(1)} s</strong>
            </div>
          </div>
          <div className="panel-copy">
            {captureLabels.map((label) => (
              <label key={label} style={{ display: "inline-flex", gap: "0.35rem", marginRight: "1rem" }}>
                <input
                  type="radio"
                  name="capture-label"
                  value={label}
                  checked={capture.activeLabel === label}
                  disabled={capture.recording || captureBusy}
                  onChange={() => {
                    void onCaptureLabelChange(label);
                  }}
                />
                <span>
                  {label} ({capture.counts[label]})
                </span>
              </label>
            ))}
          </div>
          <div className="panel-copy">
            {captureDurationOptions.map((durationMs) => (
              <label
                key={durationMs}
                style={{ display: "inline-flex", gap: "0.35rem", marginRight: "1rem" }}
              >
                <input
                  type="radio"
                  name="capture-duration"
                  value={durationMs}
                  checked={captureDurationMs === durationMs}
                  disabled={capture.recording || countdown !== null || captureBusy}
                  onChange={() => setCaptureDurationMs(durationMs)}
                />
                <span>{(durationMs / 1000).toFixed(1)}s</span>
              </label>
            ))}
          </div>
          <div className="hero-actions">
            <button
              type="button"
              disabled={!serviceRunning || capture.recording || captureBusy}
              onClick={() => {
                void startCapture();
              }}
            >
              {countdown ? `Recording in ${countdown}` : "Record labeled take"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={(!capture.recording && countdown === null) || captureBusy}
              onClick={() => {
                if (countdown !== null) {
                  setCountdown(null);
                  setCaptureBusy(false);
                  void window.airloom.setInputSuppressed(false);
                  return;
                }
                void stopCapture();
              }}
            >
              {countdown !== null ? "Cancel countdown" : "Stop capture"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={capture.takeCount === 0 || capture.recording || captureBusy}
              onClick={() => {
                setCaptureBusy(true);
                void onDiscardLastCapture().finally(() => setCaptureBusy(false));
              }}
            >
              Discard last take
            </button>
            <button
              type="button"
              className="ghost"
              disabled={capture.takeCount === 0 || capture.recording || captureBusy}
              onClick={() => {
                setCaptureBusy(true);
                void onExportCaptures().finally(() => setCaptureBusy(false));
              }}
            >
              Export captures
            </button>
          </div>
          {capture.message ? <p className="panel-copy">{capture.message}</p> : null}
          {capture.exportPath ? (
            <p className="panel-copy">Last export: {capture.exportPath}</p>
          ) : null}
          <p className="panel-copy">
            Each take auto-stops after {(captureDurationMs / 1000).toFixed(1)} seconds, so you can
            form the pose and hold it without touching the mouse.
          </p>
          <p className="panel-copy">
            Keyboard: `A` neutral, `S` open palm, `D` closed fist, `F` primary pinch, `G`
            secondary pinch, `1-4` duration, `Space`/`Enter` start, `Esc` stop or cancel,
            `Backspace` discard, `E` export.
          </p>

          <div className="eyebrow">Sandbox</div>
          <h2>Click precision</h2>
          <div className="sandbox-panel">
            <div className="metric-grid compact">
              <div className="metric-card">
                <span>Hits</span>
                <strong>{sandboxHits}</strong>
              </div>
              <div className="metric-card">
                <span>Misses</span>
                <strong>{sandboxMisses}</strong>
              </div>
              <div className="metric-card">
                <span>Accuracy</span>
                <strong>{sandboxAccuracy}%</strong>
              </div>
            </div>
            <div
              className="click-sandbox click-sandbox-wide"
              onPointerDown={() => setSandboxMisses((current) => current + 1)}
            >
              <button
                type="button"
                className="sandbox-target"
                style={{ left: `${sandboxTarget.x}%`, top: `${sandboxTarget.y}%` }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setSandboxHits((current) => current + 1);
                  setSandboxTarget(randomSandboxTarget());
                }}
                aria-label="Precision click target"
              >
                Hit
              </button>
            </div>
            <div className="hero-actions">
              <button type="button" className="ghost" onClick={resetSandbox}>
                Reset sandbox
              </button>
            </div>
            <p className="panel-copy camera-note">
              Try landing left clicks on the moving square. Hits count when the
              square is clicked; misses count when the sandbox background is clicked.
            </p>
          </div>

          <div className="hold-preview">
            <div className="hold-preview-copy">
              <span>Primary pinch hold</span>
              <strong>{primaryPinchHeldMs} ms</strong>
            </div>
            <div className="hold-track" aria-hidden="true">
              <div
                className={`hold-fill hold-fill-${primaryPinchOutcome}`}
                style={{
                  width: `${Math.max(progress * 100, primaryPinchActive ? 6 : 0)}%`,
                }}
              />
            </div>
          </div>
          <p className="panel-copy">
            Primary pinch now acts as a left click on release, while secondary
            pinch stays reserved for right click.
          </p>

          <div className="eyebrow">Speech</div>
          <h2>Push-to-talk test pad</h2>
          <div className="speech-sandbox-panel">
            <p className="panel-copy">
              Focus this field, then hold <strong>{pushToTalkGesture}</strong> to send
              <strong> {pushToTalkKey}</strong> through your normal speech-to-text stack.
            </p>
            <textarea
              className="speech-sandbox-editor"
              value={speechDraft}
              onChange={(event) => setSpeechDraft(event.target.value)}
              placeholder="Dictated text should land here while the field stays focused."
              spellCheck={false}
              rows={8}
            />
            <div className="hero-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setSpeechDraft("")}
              >
                Clear transcript
              </button>
            </div>
            <p className="panel-copy camera-note">
              This is just a local text field for end-to-end testing, so you can verify
              focus, key hold, dictated text, and clean release without leaving calibration.
            </p>
          </div>
        </div>
        <aside className="calibration-side">
          <div className="eyebrow">Camera</div>
          <h2>Live preview</h2>
          <div className="camera-card">
            <LivePreview
              serviceRunning={serviceRunning}
              cameraUnavailable={gesture === "camera-unavailable"}
            />
            <p className="panel-copy camera-note">
              This preview is sourced from the Python vision service, so it
              reflects the actual camera frames the backend is processing. Teal
              dots show detected landmarks, amber marks the raw index pointer,
              and coral marks the smoothed pointer output.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
};
