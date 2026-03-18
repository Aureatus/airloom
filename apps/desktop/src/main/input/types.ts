export type PointerButton = "left" | "middle" | "right";

export type PointerPosition = {
  x: number;
  y: number;
};

export type InputAdapter = {
  platform: string;
  isAvailable: () => boolean;
  getPointerPosition: () => Promise<PointerPosition>;
  movePointer: (position: PointerPosition) => Promise<void>;
  scroll: (amount: number) => Promise<void>;
  pointerDown: (button: PointerButton) => Promise<void>;
  pointerUp: (button: PointerButton) => Promise<void>;
  click: (button: PointerButton) => Promise<void>;
  keyDown: (key: string) => Promise<void>;
  keyUp: (key: string) => Promise<void>;
  tapKey: (key: string) => Promise<void>;
};
