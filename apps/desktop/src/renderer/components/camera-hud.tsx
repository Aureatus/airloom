import { LivePreview } from "./live-preview";

type CameraHudProps = {
  serviceRunning: boolean;
  cameraUnavailable: boolean;
  gesture: string;
  tracking: boolean;
  cameraWidth?: number;
  cameraHeight?: number;
  captureFps?: number;
  processedFps?: number;
  previewFps?: number;
  frameDelayMs?: number;
};

const formatMetric = (value: number | undefined, digits = 1) => {
  return value === undefined ? "--" : value.toFixed(digits);
};

const fpsTone = (value: number | undefined, baseline = 24) => {
  if (value === undefined) {
    return "muted";
  }
  if (value >= baseline) {
    return "good";
  }
  if (value >= baseline * 0.7) {
    return "warn";
  }
  return "bad";
};

const delayTone = (value: number | undefined) => {
  if (value === undefined) {
    return "muted";
  }
  if (value <= 35) {
    return "good";
  }
  if (value <= 60) {
    return "warn";
  }
  return "bad";
};

export const CameraHud = ({
  serviceRunning,
  cameraUnavailable,
  gesture,
  tracking,
  cameraWidth,
  cameraHeight,
  captureFps,
  processedFps,
  previewFps,
  frameDelayMs,
}: CameraHudProps) => {
  const processedBaseline = captureFps ?? 24;
  const previewBaseline = processedFps ?? captureFps ?? 24;

  return (
    <div className="camera-hud-shell">
      <section className="camera-hud-panel">
        <div className="camera-hud-header">
          <div className="camera-hud-header-main">
            <div className="camera-hud-title-row">
              <div>
                <div className="eyebrow">Camera HUD</div>
                <strong>{tracking ? gesture : "searching"}</strong>
              </div>
              <div className="camera-hud-chip">
                {serviceRunning ? (cameraUnavailable ? "camera issue" : "live") : "offline"}
              </div>
            </div>
            <div className="camera-hud-metrics">
              <span className="camera-hud-metric camera-hud-metric-neutral">
                Camera {cameraWidth ?? 0}x{cameraHeight ?? 0}
              </span>
              <span className={`camera-hud-metric camera-hud-metric-${fpsTone(captureFps)}`}>
                Capture {formatMetric(captureFps)} fps
              </span>
              <span className={`camera-hud-metric camera-hud-metric-${fpsTone(processedFps, processedBaseline)}`}>
                Processed {formatMetric(processedFps)} fps
              </span>
              <span className={`camera-hud-metric camera-hud-metric-${fpsTone(previewFps, previewBaseline)}`}>
                Preview {formatMetric(previewFps)} fps
              </span>
              <span className={`camera-hud-metric camera-hud-metric-${delayTone(frameDelayMs)}`}>
                Delay {frameDelayMs ?? 0} ms
              </span>
            </div>
          </div>
        </div>
        <LivePreview
          serviceRunning={serviceRunning}
          cameraUnavailable={cameraUnavailable}
          compact
        />
        <p className="camera-hud-copy">
          Teal is pointer hand, amber is action hand. The frame edge shows your usable camera bounds.
        </p>
      </section>
    </div>
  );
};
