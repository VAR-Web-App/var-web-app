// Global on/off preference for the "how to use this page" guides. One switch
// controls them everywhere (default ON). Persisted in localStorage; changes
// broadcast so mounted guides + the sidebar toggle update live.

const KEY = "pageGuidesOn";
const EVENT = "pageguides-changed";

export function getPageGuidesOn(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(KEY) !== "0"; // default on
}

export function setPageGuidesOn(on: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Subscribe to changes (this tab via custom event, other tabs via storage). */
export function onPageGuidesChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
