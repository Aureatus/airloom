# Gesture Spec

- Input events from the vision layer:
  - `pointer.observed`: normalized pointer coordinates from the active hand
  - `gesture.intent`: semantic gesture signals like `primary-pinch`, `thumb-middle-pinch`, and `open-palm-hold`
  - `status`: live debugging state used by the calibration UI
- Action events inside the desktop layer:
  - `pointer.move`: screen-space cursor move
  - `pointer.down` / `pointer.up`: press state for drag support
  - `click`: discrete click action, including right click from the thumb-middle pinch gesture
  - `key.tap`: mapped keyboard action such as `Return`
