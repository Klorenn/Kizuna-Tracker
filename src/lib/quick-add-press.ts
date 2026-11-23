/** Press and hold this long (ms) on the quick-add button to open the sheet instead of adding. */
export const LONG_PRESS_MS = 500;

/**
 * Press logic of the quantity quick-add button, apart from the DOM so it can be tested.
 * One `click` is one sum, however close the previous one was (a double tap is two sums): nothing
 * here listens for `dblclick` or debounces. A long press opens the sheet, and the click that ends
 * it adds nothing.
 */
export function createQuickAddPress({
  add,
  openSheet,
  holdMs = LONG_PRESS_MS,
}: {
  add: () => void;
  openSheet: () => void;
  holdMs?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    onPointerDown() {
      fired = false;
      cancel();
      timer = setTimeout(() => {
        fired = true;
        timer = null;
        openSheet();
      }, holdMs);
    },
    cancel,
    onClick() {
      if (fired) {
        fired = false;
        return;
      }
      add();
    },
  };
}
