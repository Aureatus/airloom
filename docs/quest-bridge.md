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

## Fastest human test path

1. In the desktop app, switch to `Quest Bridge` and save.
2. Open the `Quest Test` tab.
3. Press `Start service`.
4. Wait for the automatic laptop smoke test to pass. If it fails, do not touch the headset yet.
5. Type the short address shown in `Quest Test` into Quest Browser. The default path now aims for the easier `:8443` port, and the tab also renders a QR code for the full URL if that is more convenient.
6. If Quest warns about the certificate, continue past the warning once.
7. Press `Start hand bridge` on the Quest page.
8. In `Quest Test` or `Calibration`, wait for:
   - `Bridge link = connected`
   - `Hands tracked > 0`
   - clutch and push-to-talk checks to flip from `Wait` to `Ready`

## Current constraints

- If `openssl` is installed, Incantation auto-generates a local self-signed HTTPS certificate and serves the bridge over HTTPS automatically.
- If you prefer your own certificate, set `INCANTATION_QUEST_TLS_CERT` and `INCANTATION_QUEST_TLS_KEY`.
- Quest Bridge does not currently provide a live preview image; the calibration page is the main pairing/debug surface.
- Capture/export remains webcam-only.
- The `Quest Test` tab is now the recommended primary validation surface; Settings keeps the raw configuration, Calibration keeps the lower-level runtime/debug view, and the Quest tab now also exposes a QR code for the browser-ready URL.

## Safety checks

- Keep `questRequirePointerClutch` enabled unless you are deliberately testing always-live cursor motion.
- Treat `bridgeConnected`, `handsTracked`, and `fallbackReason` as the first debugging surface before changing gesture thresholds.
- Verify push-to-talk ends cleanly by intentionally dropping the gesture and by intentionally disconnecting the bridge page.
