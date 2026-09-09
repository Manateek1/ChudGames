import { describe, expect, it } from "vitest";
import { InputManager } from "../input";
describe("input focus recovery", () => {
  it("releases held keyboard and touch actions on blur", () => {
    const input = new InputManager();
    input.attach();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
    input.setVirtual("left", true);
    expect(input.isDown("up")).toBe(true);
    expect(input.isDown("left")).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(input.isDown("up")).toBe(false);
    expect(input.isDown("left")).toBe(false);
    expect(input.consumePress("up")).toBe(false);
    input.detach();
  });
});
