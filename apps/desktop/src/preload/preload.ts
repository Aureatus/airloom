import type { AirloomInputEvent } from "@incantation/shared/gesture-events";
import type { AirloomSettings } from "@incantation/shared/settings-schema";
import { contextBridge, ipcRenderer } from "electron";
import { APP_NAMESPACE } from "../main/identity";

const api = {
  getStatus: () => ipcRenderer.invoke(`${APP_NAMESPACE}:get-status`),
  getSettings: () => ipcRenderer.invoke(`${APP_NAMESPACE}:get-settings`),
  updateSettings: (payload: AirloomSettings) =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:update-settings`, payload),
  startService: () => ipcRenderer.invoke(`${APP_NAMESPACE}:start-service`),
  stopService: () => ipcRenderer.invoke(`${APP_NAMESPACE}:stop-service`),
  setInputSuppressed: (suppressed: boolean) =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:set-input-suppressed`, suppressed),
  setCaptureLabel: (label: string) =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:set-capture-label`, label),
  startCapture: () => ipcRenderer.invoke(`${APP_NAMESPACE}:start-capture`),
  stopCapture: () => ipcRenderer.invoke(`${APP_NAMESPACE}:stop-capture`),
  discardLastCapture: () =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:discard-last-capture`),
  exportCaptures: () => ipcRenderer.invoke(`${APP_NAMESPACE}:export-captures`),
  startDebugRecording: () =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:start-debug-recording`),
  stopDebugRecording: () =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:stop-debug-recording`),
  runQuestSmokeTest: () =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:run-quest-smoke-test`),
  sendEvent: (payload: AirloomInputEvent) =>
    ipcRenderer.invoke(`${APP_NAMESPACE}:send-event`, payload),
  onStatus: (listener: (value: unknown) => void) => {
    const wrapped = (_event: unknown, value: unknown) => listener(value);
    ipcRenderer.on(`${APP_NAMESPACE}:status`, wrapped);
    return () => ipcRenderer.off(`${APP_NAMESPACE}:status`, wrapped);
  },
  onPreviewFrame: (listener: (value: Uint8Array) => void) => {
    const wrapped = (_event: unknown, value: Uint8Array) => listener(value);
    ipcRenderer.on(`${APP_NAMESPACE}:preview-frame`, wrapped);
    return () => ipcRenderer.off(`${APP_NAMESPACE}:preview-frame`, wrapped);
  },
};

contextBridge.exposeInMainWorld(APP_NAMESPACE, api);
