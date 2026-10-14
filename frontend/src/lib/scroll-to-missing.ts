export const FIELD_REVEAL_EVENT = "field-reveal";

// Collapsible opens itself on this event.
export function scrollToFirstMissingField(): boolean {
  const field = document.querySelector<HTMLElement>('[data-missing="true"]');
  if (!field) return false;

  const breath =
    field.dataset.bloom === "true" ? "animate-field-breath-bloom" : "animate-field-breath";

  window.dispatchEvent(new CustomEvent<HTMLElement>(FIELD_REVEAL_EVENT, { detail: field }));
  requestAnimationFrame(() => {
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = field.querySelector<HTMLElement>("input, textarea");
    // A bare container (e.g. an error summary) is only focusable programmatically with tabindex -1.
    if (!input && !field.hasAttribute("tabindex")) field.tabIndex = -1;
    (input ?? field).focus({ preventScroll: true });

    field.classList.remove(breath);
    void field.offsetWidth; // restart the animation if it is still running from a previous attempt
    field.classList.add(breath);
    field.addEventListener("animationend", () => field.classList.remove(breath), { once: true });
  });
  return true;
}
