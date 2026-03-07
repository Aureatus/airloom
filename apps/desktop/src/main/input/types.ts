export type PointerButton = "left" | "right";

export type PointerPosition = {
  x: number;
  y: number;
};

export type InputAdapter = {
  platform: string;
  isAvailable: () => boolean;
  movePointer: (position: PointerPosition) => Promise<void>;
  pointerDown: (button: PointerButton) => Promise<void>;
  pointerUp: (button: PointerButton) => Promise<void>;
  click: (button: PointerButton) => Promise<void>;
  tapKey: (key: string) => Promise<void>;
};
