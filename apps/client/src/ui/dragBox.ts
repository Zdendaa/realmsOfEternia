/**
 * The box-selection rectangle. Moving with the mouse is a per-frame change, so it is
 * drawn by updating one DOM element's style directly instead of through React state.
 */
let element: HTMLDivElement | null = null;

export const dragBox = {
  attach(el: HTMLDivElement | null) {
    element = el;
  },
  show(x1: number, y1: number, x2: number, y2: number) {
    if (!element) return;
    element.style.display = 'block';
    element.style.left = `${Math.min(x1, x2)}px`;
    element.style.top = `${Math.min(y1, y2)}px`;
    element.style.width = `${Math.abs(x2 - x1)}px`;
    element.style.height = `${Math.abs(y2 - y1)}px`;
  },
  hide() {
    if (element) element.style.display = 'none';
  },
};
