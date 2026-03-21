# Quest Bridge

Quest Bridge is the Stage-1 `Meta Quest 3 -> local Linux laptop` path for Incantation.

## Intended setup

- Quest 3 runs the lightweight browser client in `apps/vision-service/web/quest-bridge`
- the local Linux laptop still runs the Python vision service and Electron desktop mapper
- X11 remains the supported input injection path
- remote desktop / VPS layers stay out of the loop until the local interaction feels reliable

## Flow

1. Start Incantation with `trackingBackend = quest-bridge`
2. Open the Quest Bridge page from the headset browser
3. The browser streams normalized hand landmarks to the laptop bridge server
4. `apps/vision-service/app/quest_tracking.py` converts those landmarks into the existing `FrameState`
5. `apps/vision-service/app/gestures.py` emits semantic gesture events
6. Electron maps them into X11 pointer, click, scroll, and push-to-talk actions

## Current constraints

- The built-in bridge serves plain HTTP by default for easy local testing.
- Quest Browser hand-tracking flows usually need a secure context, so set `INCANTATION_QUEST_TLS_CERT` and `INCANTATION_QUEST_TLS_KEY` if you want the built-in bridge server to present HTTPS.
- Quest Bridge does not currently provide a live preview image; the calibration page is the main pairing/debug surface.
- Capture/export remains webcam-only.

## Safety checks

- Keep `questRequirePointerClutch` enabled unless you are deliberately testing always-live cursor motion.
- Treat `bridgeConnected`, `handsTracked`, and `fallbackReason` as the first debugging surface before changing gesture thresholds.
- Verify push-to-talk ends cleanly by intentionally dropping the gesture and by intentionally disconnecting the bridge page.
