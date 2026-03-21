import type { AirloomStatusDebug } from "@incantation/shared/gesture-events";
import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";

type QuestBridgeStatus = {
  enabled: boolean;
  port: number;
  recommendedUrl: string | null;
  recommendedAddress: string | null;
  candidateUrls: string[];
  desktopSelfTestUrl: string;
  desktopSelfTestAddress: string;
  smokeTestCommand: string;
  httpsReady: boolean;
  certificateMode: "manual" | "auto" | "none";
  warnings: string[];
};

type QuestSmokeState = {
  running: boolean;
  success: boolean | null;
  startedAt: string | null;
  completedAt: string | null;
  output: string;
};

type QuestTestPageProps = {
  serviceRunning: boolean;
  questBridge: QuestBridgeStatus;
  questSmoke: QuestSmokeState;
  debug: AirloomStatusDebug;
  gesture: string;
  pointerControlEnabled: boolean;
  pushToTalkGesture: string;
  pushToTalkKey: string;
  onRunSmokeTest: () => Promise<unknown>;
};

export const QuestTestPage = ({
  serviceRunning,
  questBridge,
  questSmoke,
  debug,
  gesture,
  pointerControlEnabled,
  pushToTalkGesture,
  pushToTalkKey,
  onRunSmokeTest,
}: QuestTestPageProps) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const typedAddress = questBridge.recommendedAddress;
  const browserReadyUrl = questBridge.recommendedUrl;

  const typedAddressParts = useMemo(() => {
    if (!typedAddress) {
      return { host: null, port: String(questBridge.port) };
    }

    const separatorIndex = typedAddress.lastIndexOf(":");
    if (separatorIndex <= 0) {
      return { host: typedAddress, port: null };
    }

    return {
      host: typedAddress.slice(0, separatorIndex),
      port: typedAddress.slice(separatorIndex + 1),
    };
  }, [questBridge.port, typedAddress]);

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

  const validation = useMemo(() => {
    return [
      {
        label: "Service running",
        ready: serviceRunning,
        detail: serviceRunning
          ? "Incantation bridge process is live."
          : "Press Start service from the main screen first.",
      },
      {
        label: "HTTPS ready",
        ready: questBridge.httpsReady,
        detail: questBridge.httpsReady
          ? `Quest can use ${questBridge.recommendedAddress ?? `localhost:${questBridge.port}`}.`
          : "Install openssl or provide manual cert paths before testing in Quest Browser.",
      },
      {
        label: "Desktop smoke test",
        ready: questSmoke.success === true,
        detail: questSmoke.running
          ? "Running the laptop-only bridge check now."
          : questSmoke.success === false
            ? "Smoke test failed. Read the output panel, then rerun."
            : "Run the smoke test here before touching the headset.",
      },
      {
        label: "Bridge connected",
        ready: debug.bridgeConnected === true,
        detail:
          debug.bridgeConnected === true
            ? "The Quest browser page is sending frames to the laptop."
            : "In Quest Browser, open the short address shown here and press Start hand bridge.",
      },
      {
        label: "Hands tracked",
        ready: (debug.handsTracked ?? 0) > 0,
        detail:
          (debug.handsTracked ?? 0) > 0
            ? `Tracking ${debug.handsTracked} hand(s).`
            : "Put at least one hand in front of the headset cameras.",
      },
      {
        label: "Clutch gates movement",
        ready: pointerControlEnabled,
        detail: pointerControlEnabled
          ? "Closed-fist clutch is active right now."
          : "Make a closed fist and confirm the cursor only moves while held.",
      },
      {
        label: "PTT gesture works",
        ready: gesture === "push-to-talk",
        detail:
          gesture === "push-to-talk"
            ? `PTT is holding ${pushToTalkKey}.`
            : `Flash ${pushToTalkGesture} and confirm ${pushToTalkKey} holds and releases cleanly.`,
      },
    ];
  }, [
    debug.bridgeConnected,
    debug.handsTracked,
    gesture,
    pointerControlEnabled,
    pushToTalkGesture,
    pushToTalkKey,
    questBridge.httpsReady,
    questBridge.port,
    questBridge.recommendedAddress,
    questSmoke.running,
    questSmoke.success,
    serviceRunning,
  ]);

  if (!questBridge.enabled) {
    return (
      <section className="panel settings-shell">
        <div className="settings-banner">
          <div>
            <div className="eyebrow">Quest Test</div>
            <h2>Switch to Quest Bridge first</h2>
            <p className="panel-copy">
              This tab becomes the headset test cockpit once you choose `Quest
              Bridge` in Settings.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel settings-shell quest-test-shell">
      <div className="settings-banner">
        <div>
          <div className="eyebrow">Quest Test</div>
          <h2>Headset pairing, smoke test, and validation</h2>
          <p className="panel-copy">
            This tab is the idiot-proof path: confirm the laptop bridge works,
            type the short address into Quest Browser, then watch the validation
            list flip to Ready.
          </p>
        </div>
        <div className="hero-actions quest-guide-actions">
          <button type="button" onClick={() => void onRunSmokeTest()}>
            {questSmoke.running ? "Running smoke test..." : "Run smoke test"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (questBridge.recommendedAddress) {
                void copyValue(questBridge.recommendedAddress, "short address");
              }
            }}
            disabled={!questBridge.recommendedAddress}
          >
            Copy short address
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (questBridge.recommendedUrl) {
                void copyValue(questBridge.recommendedUrl, "Quest URL");
              }
            }}
            disabled={!questBridge.recommendedUrl}
          >
            Copy full URL
          </button>
        </div>
      </div>

      <div className="quest-test-hero">
        <div className="quest-test-hero-card">
          <span>Type this in Quest Browser</span>
          {typedAddressParts.host ? (
            <div className="quest-hero-address">
              <strong className="quest-hero-url monospace">
                {typedAddressParts.host}
              </strong>
              {typedAddressParts.port ? (
                <span className="quest-hero-port monospace">
                  :{typedAddressParts.port}
                </span>
              ) : null}
            </div>
          ) : (
            <strong className="quest-hero-url monospace">
              No LAN IP yet (port {questBridge.port})
            </strong>
          )}
          <p className="panel-copy">
            The browser should auto-fill `https://`. If it does not, use the
            full URL from the copy button instead.
          </p>
        </div>
        <div className="quest-test-hero-card quest-qr-card">
          <span>Scan if typing is annoying</span>
          {browserReadyUrl ? (
            <div className="quest-qr-shell">
              <QRCodeSVG
                value={browserReadyUrl}
                size={196}
                bgColor="transparent"
                fgColor="#f4ddb0"
                level="M"
                marginSize={1}
              />
            </div>
          ) : (
            <div className="quest-qr-placeholder">
              QR appears once a LAN URL exists.
            </div>
          )}
          <p className="panel-copy">
            This encodes the full browser-ready Quest URL, including `https://`.
          </p>
        </div>
        <div className="quest-test-hero-card">
          <span>Laptop self-test</span>
          <strong className="monospace">
            {questBridge.desktopSelfTestAddress}
          </strong>
          <p className="panel-copy">
            This is what the built-in smoke test hits before you put the headset
            on. If this fails, do not bother with Quest yet.
          </p>
        </div>
      </div>

      <div className="metric-grid compact">
        <div className="metric-card">
          <span>Service</span>
          <strong>{serviceRunning ? "running" : "stopped"}</strong>
        </div>
        <div className="metric-card">
          <span>HTTPS</span>
          <strong>{questBridge.httpsReady ? "ready" : "missing"}</strong>
        </div>
        <div className="metric-card">
          <span>Certificate</span>
          <strong>{questBridge.certificateMode}</strong>
        </div>
        <div className="metric-card">
          <span>Bridge</span>
          <strong>{debug.bridgeConnected ? "connected" : "waiting"}</strong>
        </div>
        <div className="metric-card">
          <span>Hands tracked</span>
          <strong>{debug.handsTracked ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Smoke test</span>
          <strong>
            {questSmoke.running
              ? "running"
              : questSmoke.success === true
                ? "passed"
                : questSmoke.success === false
                  ? "failed"
                  : "idle"}
          </strong>
        </div>
      </div>

      {copyFeedback ? <p className="panel-copy">{copyFeedback}</p> : null}

      <div className="quest-url-list monospace">
        <div>
          Quest URL: {questBridge.recommendedUrl ?? "No LAN URL detected yet"}
        </div>
        <div>Desktop self-test URL: {questBridge.desktopSelfTestUrl}</div>
        <div>Terminal fallback: {questBridge.smokeTestCommand}</div>
        {questBridge.candidateUrls.slice(1).map((url) => (
          <div key={url}>Alternate URL: {url}</div>
        ))}
      </div>

      <div className="quest-checklist">
        {validation.map((item) => (
          <div className="quest-checklist-item" key={item.label}>
            <span
              className={`quest-status-pill ${item.ready ? "quest-status-pill-ready" : "quest-status-pill-pending"}`}
            >
              {item.ready ? "Ready" : "Wait"}
            </span>
            <div>
              <strong>{item.label}</strong>
              <p className="panel-copy">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="quest-test-sequence">
        <div className="quest-test-sequence-step">
          <strong>1.</strong>
          <span>
            Press `Start service` and wait for the automatic smoke test.
          </span>
        </div>
        <div className="quest-test-sequence-step">
          <strong>2.</strong>
          <span>
            If the smoke test fails, fix that first. If it passes, type the
            short address into Quest Browser.
          </span>
        </div>
        <div className="quest-test-sequence-step">
          <strong>3.</strong>
          <span>
            Accept the local certificate warning once if Quest shows it, then
            press `Start hand bridge` on the page.
          </span>
        </div>
        <div className="quest-test-sequence-step">
          <strong>4.</strong>
          <span>
            Watch `Bridge connected`, `Hands tracked`, `Clutch`, and `PTT` flip
            to Ready.
          </span>
        </div>
      </div>

      <div className="quest-smoke-panel">
        <div>
          <div className="eyebrow">Smoke output</div>
          <h3>Laptop-side result</h3>
          <p className="panel-copy">
            This is the same smoke test you can run in a terminal, but launched
            directly from the app.
          </p>
        </div>
        <pre className="panel-copy monospace quest-smoke-output">
          {questSmoke.output}
        </pre>
      </div>

      {questBridge.warnings.map((warning) => (
        <p className="warning-text" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  );
};
