import { describe, expect, test } from "bun:test";
import {
  normalizeXdotoolKeyBinding,
  splitXdotoolKeyBinding,
} from "../../src/main/input/linux-x11";

describe("normalizeXdotoolKeyBinding", () => {
  test("normalizes control-space style chords", () => {
    expect(normalizeXdotoolKeyBinding("Control+Space")).toBe("ctrl+space");
    expect(normalizeXdotoolKeyBinding("Ctrl + Spacebar")).toBe("ctrl+space");
  });

  test("preserves simple keys and common special keys", () => {
    expect(normalizeXdotoolKeyBinding("Return")).toBe("Return");
    expect(normalizeXdotoolKeyBinding("esc")).toBe("Escape");
    expect(normalizeXdotoolKeyBinding("F12")).toBe("F12");
  });

  test("normalizes multi-modifier chords", () => {
    expect(normalizeXdotoolKeyBinding("Shift+Control+space")).toBe(
      "shift+ctrl+space",
    );
    expect(normalizeXdotoolKeyBinding("Meta+Alt+K")).toBe("super+alt+K");
  });

  test("splits chords into ordered key parts", () => {
    expect(splitXdotoolKeyBinding("Ctrl+Space")).toEqual(["ctrl", "space"]);
    expect(splitXdotoolKeyBinding("Shift+Alt+K")).toEqual([
      "shift",
      "alt",
      "K",
    ]);
  });
});
