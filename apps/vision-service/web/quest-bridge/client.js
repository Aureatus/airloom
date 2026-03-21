const jointOrder = [
  "wrist",
  "thumb-metacarpal",
  "thumb-phalanx-proximal",
  "thumb-phalanx-distal",
  "thumb-tip",
  "index-finger-metacarpal",
  "index-finger-phalanx-proximal",
  "index-finger-phalanx-intermediate",
  "index-finger-tip",
  "middle-finger-metacarpal",
  "middle-finger-phalanx-proximal",
  "middle-finger-phalanx-intermediate",
  "middle-finger-tip",
  "ring-finger-metacarpal",
  "ring-finger-phalanx-proximal",
  "ring-finger-phalanx-intermediate",
  "ring-finger-tip",
  "pinky-finger-metacarpal",
  "pinky-finger-phalanx-proximal",
  "pinky-finger-phalanx-intermediate",
  "pinky-finger-tip",
];

const state = {
  posting: false,
  session: null,
  referenceSpace: null,
};

const sessionState = document.querySelector("#session-state");
const bridgeState = document.querySelector("#bridge-state");
const handsState = document.querySelector("#hands-state");
const frameState = document.querySelector("#frame-state");
const startButton = document.querySelector("#start-session");

const setLabel = (element, text, className) => {
  element.textContent = text;
  element.className = className;
};

const normalizePoint = (transform) => {
  const x = (transform.position.x + 0.3) / 0.6;
  const y = 1 - (transform.position.y - 0.8) / 0.6;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
};

const collectHand = (inputSource, frame, referenceSpace) => {
  if (!inputSource.hand) {
    return null;
  }

  const landmarks = [];
  for (const jointName of jointOrder) {
    const jointSpace = inputSource.hand.get(jointName);
    if (!jointSpace) {
      return null;
    }

    const jointPose = frame.getJointPose(jointSpace, referenceSpace);
    if (!jointPose) {
      return null;
    }
    landmarks.push(normalizePoint(jointPose.transform));
  }

  return {
    handedness: inputSource.handedness || "unknown",
    confidence: 0.92,
    landmarks,
  };
};

const postFrame = async (payload) => {
  if (state.posting) {
    return;
  }
  state.posting = true;
  try {
    const response = await fetch("/api/frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Bridge rejected frame (${response.status})`);
    }
    setLabel(bridgeState, "Streaming", "good");
    frameState.textContent = new Date().toLocaleTimeString();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    setLabel(bridgeState, message, "warn");
  } finally {
    state.posting = false;
  }
};

const onFrame = async (_time, frame) => {
  if (!state.session || !state.referenceSpace) {
    return;
  }

  const hands = state.session.inputSources
    .map((inputSource) => collectHand(inputSource, frame, state.referenceSpace))
    .filter(Boolean);
  handsState.textContent = String(hands.length);

  await postFrame({
    timestampMs: Math.round(performance.now()),
    hands,
  });

  state.session.requestAnimationFrame(onFrame);
};

const startSession = async () => {
  if (!navigator.xr) {
    setLabel(sessionState, "WebXR unavailable", "warn");
    return;
  }

  try {
    const session = await navigator.xr.requestSession("immersive-vr", {
      requiredFeatures: ["hand-tracking"],
      optionalFeatures: ["local-floor"],
    });
    const referenceSpace = await session.requestReferenceSpace("local");
    state.session = session;
    state.referenceSpace = referenceSpace;
    setLabel(sessionState, "Immersive hand session", "good");
    session.addEventListener("end", () => {
      state.session = null;
      state.referenceSpace = null;
      setLabel(sessionState, "Ended", "warn");
      setLabel(bridgeState, "Waiting", "warn");
      handsState.textContent = "0";
    });
    session.requestAnimationFrame(onFrame);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Session failed";
    setLabel(sessionState, message, "warn");
  }
};

startButton.addEventListener("click", () => {
  void startSession();
});
