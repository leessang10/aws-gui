import { useSyncExternalStore } from "react";
export type ThemeMode = "light" | "dark" | "system";
export function getThemeMode(): ThemeMode {
  const value = localStorage.getItem("orbit.theme");
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(mode = getThemeMode()): "light" | "dark" {
  return mode === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : mode;
}
export function applyTheme() {
  const resolved = resolveTheme();
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}
export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem("orbit.theme", mode);
  applyTheme();
  window.dispatchEvent(new Event("orbit:theme"));
}
function subscribe(notify: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    applyTheme();
    notify();
  };
  media.addEventListener("change", update);
  window.addEventListener("orbit:theme", update);
  window.addEventListener("storage", update);
  applyTheme();
  return () => {
    media.removeEventListener("change", update);
    window.removeEventListener("orbit:theme", update);
    window.removeEventListener("storage", update);
  };
}
const snapshot = () => `${getThemeMode()}:${resolveTheme()}`;
export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot);
  const [mode, resolved] = value.split(":") as [ThemeMode, "light" | "dark"];
  return { mode, resolved, setMode: setThemeMode };
}
