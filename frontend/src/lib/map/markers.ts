const GOLDEN_ANGLE_DEGREES = 137.508;

export function dayColor(dayNumber: number): string {
  const hue = ((dayNumber - 1) * GOLDEN_ANGLE_DEGREES) % 360;
  return `oklch(0.67 0.17 ${hue.toFixed(2)})`;
}

export interface MarkerCallbacks {
  onHover: (itemId: string | null) => void;
  onClick: (itemId: string) => void;
}

export function buildMarkerElement(
  itemId: string,
  dayNumber: number,
  label: string,
  callbacks: MarkerCallbacks,
): HTMLElement {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.dataset.itemId = itemId;
  wrapper.className = "ajmo-map-marker";
  wrapper.setAttribute("aria-label", `${label} (day ${dayNumber})`);

  const badge = document.createElement("span");
  badge.className = "ajmo-map-marker__badge";
  badge.style.background = dayColor(dayNumber);
  badge.textContent = String(dayNumber);
  wrapper.appendChild(badge);

  wrapper.addEventListener("pointerenter", () => callbacks.onHover(itemId), { passive: true });
  wrapper.addEventListener("pointerleave", () => callbacks.onHover(null), { passive: true });
  wrapper.addEventListener("focus", () => callbacks.onHover(itemId));
  wrapper.addEventListener("blur", () => callbacks.onHover(null));
  wrapper.addEventListener("click", () => callbacks.onClick(itemId));

  return wrapper;
}

export function applyHighlight(element: HTMLElement, active: boolean): void {
  element.classList.toggle("ajmo-map-marker--active", active);
}

export function buildHotelMarkerElement(
  markerId: string,
  label: string,
  callbacks: MarkerCallbacks,
): HTMLElement {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.dataset.itemId = markerId;
  wrapper.className = "ajmo-map-marker";
  wrapper.setAttribute("aria-label", `${label} (hotel)`);

  const badge = document.createElement("span");
  badge.className = "ajmo-map-marker__badge ajmo-map-marker__badge--hotel";
  badge.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  wrapper.appendChild(badge);

  wrapper.addEventListener("pointerenter", () => callbacks.onHover(markerId), { passive: true });
  wrapper.addEventListener("pointerleave", () => callbacks.onHover(null), { passive: true });
  wrapper.addEventListener("focus", () => callbacks.onHover(markerId));
  wrapper.addEventListener("blur", () => callbacks.onHover(null));
  wrapper.addEventListener("click", () => callbacks.onClick(markerId));

  return wrapper;
}
