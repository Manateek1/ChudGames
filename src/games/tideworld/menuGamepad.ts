/** Use the same focusable controls for controllers, keyboard and touch. */
export function bindMenuGamepad() {
  let frame = 0;
  let previous = new Set<number>();
  let repeatAt = 0;
  let lastMenu: HTMLElement | null = null;
  function poll(time: number) {
    frame = requestAnimationFrame(poll);
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
    if (!pad) return;
    const down = new Set(pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    const started = (i: number) => down.has(i) && !previous.has(i);
    const menu = document.querySelector<HTMLElement>(".tw-overlay, .tw-title");
    if (menu) {
      const controls = Array.from(
        menu.querySelectorAll<HTMLElement>("button:enabled, input:enabled, select:enabled, summary"),
      ).filter((e) => e.getClientRects().length);
      const focus = document.activeElement as HTMLElement;
      const index = controls.indexOf(focus);
      const vertical =
        (down.has(13) ? 1 : 0) - (down.has(12) ? 1 : 0) ||
        (Math.abs(pad.axes[1] ?? 0) > 0.55 ? Math.sign(pad.axes[1]) : 0);
      const horizontal =
        (down.has(15) ? 1 : 0) - (down.has(14) ? 1 : 0) ||
        (Math.abs(pad.axes[0] ?? 0) > 0.55 ? Math.sign(pad.axes[0]) : 0);
      const direction = vertical || horizontal;
      if (direction && time >= repeatAt && controls.length) {
        repeatAt = time + 200;
        if (horizontal && !vertical && focus instanceof HTMLSelectElement) {
          focus.selectedIndex = Math.max(
            0,
            Math.min(focus.length - 1, focus.selectedIndex + horizontal),
          );
          focus.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (
          horizontal &&
          !vertical &&
          focus instanceof HTMLInputElement &&
          focus.type === "range"
        ) {
          if (horizontal > 0) focus.stepUp();
          else focus.stepDown();
          focus.dispatchEvent(new Event("input", { bubbles: true }));
        } else controls[index < 0 ? 0 : (index + direction + controls.length) % controls.length].focus();
      } else if (!direction) repeatAt = 0;
      if (started(0)) {
        if (index >= 0) focus.click();
        else controls[0]?.focus();
      } else if (menu === lastMenu && (started(1) || started(3) || started(8))) {
        const back = controls.find((e) =>
          /^(Close|Back|Return to worlds)$/i.test(e.textContent?.trim() ?? ""),
        );
        back?.click();
      }
    }
    previous = down;
    lastMenu = menu;
  }
  frame = requestAnimationFrame(poll);
  return () => cancelAnimationFrame(frame);
}
