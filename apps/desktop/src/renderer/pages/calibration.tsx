type CalibrationProps = {
  tracking: boolean;
  gesture: string;
  pinchStrength: number;
  primaryPinchActive: boolean;
  primaryPinchHeldMs: number;
  primaryPinchOutcome: "idle" | "click" | "drag";
  dragHoldThresholdMs: number;
};

export const CalibrationPage = ({
  tracking,
  gesture,
  pinchStrength,
  primaryPinchActive,
  primaryPinchHeldMs,
  primaryPinchOutcome,
  dragHoldThresholdMs,
}: CalibrationProps) => {
  const progress =
    dragHoldThresholdMs <= 0
      ? 1
      : Math.min(primaryPinchHeldMs / dragHoldThresholdMs, 1);

  return (
    <section className="panel">
      <div className="eyebrow">Calibration</div>
      <h2>Live gesture signal</h2>
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
          <span>Pinch</span>
          <strong>{pinchStrength.toFixed(2)}</strong>
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
        Use this screen while tuning thresholds. The Python service emits
        structured status updates even in replay mode.
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
    </section>
  );
};
