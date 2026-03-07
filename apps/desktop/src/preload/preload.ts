import type { AirloomInputEvent } from "@airloom/shared/gesture-events";
import type { AirloomSettings } from "@airloom/shared/settings-schema";
import { contextBridge, ipcRenderer } from "electron";

const api = {
  getStatus: () => ipcRenderer.invoke("airloom:get-status"),
  getSettings: () => ipcRenderer.invoke("airloom:get-settings"),
  updateSettings: (payload: AirloomSettings) =>
    ipcRenderer.invoke("airloom:update-settings", payload),
  startService: () => ipcRenderer.invoke("airloom:start-service"),
  stopService: () => ipcRenderer.invoke("airloom:stop-service"),
  sendEvent: (payload: AirloomInputEvent) =>
    ipcRenderer.invoke("airloom:send-event", payload),
  onStatus: (listener: (value: unknown) => void) => {
    const wrapped = (_event: unknown, value: unknown) => listener(value);
    ipcRenderer.on("airloom:status", wrapped);
    return () => ipcRenderer.off("airloom:status", wrapped);
  },
};

contextBridge.exposeInMainWorld("airloom", api);
