export type InputAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "action"
  | "action2"
  | "pause";

const KEY_TO_ACTION: Record<string, InputAction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  a: "left",
  d: "right",
  w: "up",
  s: "down",
  " ": "action",
  Enter: "action",
  Shift: "action2",
  e: "action2",
  Escape: "pause",
  p: "pause",
};

export class InputManager {
  private down = new Set<InputAction>();

  private pressed = new Set<InputAction>();

  private virtual = new Set<InputAction>();

  private attached = false;

  private onBlur = (): void => {
    this.down.clear();
    this.pressed.clear();
    this.virtual.clear();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement && (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable || (target.tagName === "BUTTON" && event.key === "Enter"))) return;
    const action = KEY_TO_ACTION[event.key] ?? KEY_TO_ACTION[event.key.toLowerCase()];
    if (!action) {
      return;
    }
    event.preventDefault();
    if (!this.down.has(action)) {
      this.pressed.add(action);
    }
    this.down.add(action);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const action = KEY_TO_ACTION[event.key] ?? KEY_TO_ACTION[event.key.toLowerCase()];
    if (!action) {
      return;
    }
    event.preventDefault();
    this.down.delete(action);
  };

  attach(): void {
    if (this.attached || typeof window === "undefined") {
      return;
    }

    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp, { passive: false });
    window.addEventListener("blur", this.onBlur);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached || typeof window === "undefined") {
      return;
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.attached = false;
    this.down.clear();
    this.pressed.clear();
    this.virtual.clear();
  }

  isDown(action: InputAction): boolean {
    return this.down.has(action) || this.virtual.has(action);
  }

  consumePress(action: InputAction): boolean {
    if (!this.pressed.has(action)) {
      return false;
    }
    this.pressed.delete(action);
    return true;
  }

  setVirtual(action: InputAction, active: boolean): void {
    if (active) {
      if (!this.virtual.has(action)) {
        this.pressed.add(action);
      }
      this.virtual.add(action);
      return;
    }
    this.virtual.delete(action);
  }

  clearVirtual(): void {
    this.virtual.clear();
  }
}
