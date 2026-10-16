export type Appearance = "dark" | "light" | "system";
const storageKey = "world-report-appearance";

export function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "dark" || value === "light" || value === "system")
      return value;
  } catch {
    /* Appearance remains usable when storage is unavailable. */
  }
  return "dark";
}

export function saveAppearance(value: Appearance): void {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* Apply for this session. */
  }
}

export function applyAppearance(value: Appearance): void {
  const dark =
    value === "dark" ||
    (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#171c1e" : "#f9fafb");
}

export function watchAppearance(value: Appearance): () => void {
  applyAppearance(value);
  if (value !== "system") return () => {};
  const query = matchMedia("(prefers-color-scheme: dark)");
  const update = () => applyAppearance(value);
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}
