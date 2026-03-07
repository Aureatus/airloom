import { useMemo } from "react";
import { LivePreview } from "../components/live-preview";

type CalibrationProps = {
  serviceRunning: boolean;
  tracking: boolean;
  gesture: string;
  pinchStrength: number;
  pointerControlEnabled: boolean;
  debug: {
    confidence: number;
    brightness: number;
    closedFist: boolean;
    openPalmHold: boolean;
    secondaryPinchStrength: number;
  };
  primaryPinchActive: boolean;
  primaryPinchHeldMs: number;
  primaryPinchOutcome: "idle" | "click" | "drag";
  dragHoldThresholdMs: number;
};

export const CalibrationPage = ({
  serviceRunning,
  tracking,
  gesture,
  pinchStrength,
  pointerControlEnabled,
  debug,
  primaryPinchActive,
  primaryPinchHeldMs,
  primaryPinchOutcome,
  dragHoldThresholdMs,
}: CalibrationProps) => {
  const progress =
    dragHoldThresholdMs <= 0
      ? 1
      : Math.min(primaryPinchHeldMs / dragHoldThresholdMs, 1);

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

  return (
    <section className="panel">
      <div className="eyebrow">Calibration</div>
      <h2>Live gesture signal</h2>
      <div className="calibration-layout">
        <div className="calibration-main">
          <div className="metric-grid">
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
              <strong>{pointerControlEnabled ? "Armed" : "Frozen"}</strong>
            </div>
            <div className="metric-card">
              <span>Primary pinch</span>
              <strong>{pinchStrength.toFixed(2)}</strong>
            </div>
            <div className="metric-card">
              <span>Secondary pinch</span>
              <strong>{debug.secondaryPinchStrength.toFixed(2)}</strong>
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
              <span>Closed fist</span>
              <strong>{debug.closedFist ? "Seen" : "No"}</strong>
            </div>
            <div className="metric-card">
              <span>Open palm</span>
              <strong>{debug.openPalmHold ? "Seen" : "No"}</strong>
            </div>
            <div className="metric-card">
              <span>Pinch hold</span>
              <strong>{primaryPinchHeldMs} ms</strong>
            </div>
            <div className="metric-card">
              <span>Mapper preview</span>
              <strong>{primaryPinchOutcome}</strong>
            </div>
            <div className="metric-card">
              <span>Hold active</span>
              <strong>{primaryPinchActive ? "Yes" : "No"}</strong>
            </div>
          </div>
          <p className="panel-copy">
            Cursor motion starts frozen by default. Make a brief closed fist to
            arm pointer control, then repeat it to freeze the cursor again.
          </p>
          <p className="panel-copy">
            If scene light stays in the dim range or confidence drops while your
            hand is clearly visible, low light is probably hurting detection.
          </p>
          <div className="hold-preview">
            <div className="hold-preview-copy">
              <span>Click vs drag</span>
              <strong>
                {primaryPinchHeldMs} / {dragHoldThresholdMs} ms
              </strong>
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
            A primary pinch released before {dragHoldThresholdMs} ms becomes a
            click; held longer, it becomes a drag release.
          </p>
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
              reflects the actual camera frames the backend is processing.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
};
