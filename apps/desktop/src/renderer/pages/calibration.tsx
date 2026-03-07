type CalibrationProps = {
  tracking: boolean;
  gesture: string;
  pinchStrength: number;
};

export const CalibrationPage = ({
  tracking,
  gesture,
  pinchStrength,
}: CalibrationProps) => {
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
      </div>
      <p className="panel-copy">
        Use this screen while tuning thresholds. The Python service emits
        structured status updates even in replay mode.
      </p>
    </section>
  );
};
