export const FIELD_REVEAL_EVENT = "field-reveal";

const BREATH_CLASS = "animate-field-breath";

// Collapsible opens itself on this event; a closed section is inert.
export function scrollToFirstMissingField(): boolean {
  const field = document.querySelector<HTMLElement>('[data-missing="true"]');
  if (!field) return false;

  window.dispatchEvent(new CustomEvent<HTMLElement>(FIELD_REVEAL_EVENT, { detail: field }));
  requestAnimationFrame(() => {
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    (field.querySelector<HTMLElement>("input, textarea") ?? field).focus({ preventScroll: true });

    field.classList.remove(BREATH_CLASS);
    void field.offsetWidth;
    field.classList.add(BREATH_CLASS);
    field.addEventListener("animationend", () => field.classList.remove(BREATH_CLASS), {
      once: true,
    });
  });
  return true;
}
