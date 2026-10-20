import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { applyTheme, getThemeMode, setThemeMode, useTheme } from "../src/theme";
import { Settings } from "../src/pages";
let dark = false;
let change: Set<() => void>;
beforeEach(() => {
  dark = false;
  change = new Set();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_type: string, fn: () => void) => change.add(fn),
      removeEventListener: (_type: string, fn: () => void) => change.delete(fn),
    })),
  );
  applyTheme();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});
function Probe() {
  const theme = useTheme();
  return (
    <p>
      {theme.mode}:{theme.resolved}
    </p>
  );
}
test("system is default, responds to OS changes, and explicit light ignores them", () => {
  render(<Probe />);
  expect(screen.getByText("system:light")).toBeInTheDocument();
  act(() => {
    dark = true;
    change.forEach((fn) => fn());
  });
  expect(document.documentElement).toHaveClass("dark");
  expect(screen.getByText("system:dark")).toBeInTheDocument();
  act(() => setThemeMode("light"));
  expect(document.documentElement).not.toHaveClass("dark");
  act(() => {
    dark = false;
    change.forEach((fn) => fn());
    dark = true;
    change.forEach((fn) => fn());
  });
  expect(screen.getByText("light:light")).toBeInTheDocument();
});
test("saved dark mode applies at startup and invalid preferences recover to system", () => {
  setThemeMode("dark");
  expect(localStorage.getItem("orbit.theme")).toBe("dark");
  document.documentElement.classList.remove("dark");
  applyTheme();
  expect(document.documentElement).toHaveClass("dark");
  localStorage.setItem("orbit.theme", "invalid");
  expect(getThemeMode()).toBe("system");
  applyTheme();
  expect(document.documentElement).not.toHaveClass("dark");
});
test("settings immediately persist the chosen mode and cross-window updates apply", () => {
  render(
    <Settings
      ctx={{
        profile: "test",
        region: "us-east-1",
        demo: true,
        navigate: vi.fn(),
        clearCache: vi.fn(),
      }}
      onSave={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Theme"), {
    target: { value: "dark" },
  });
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem("orbit.theme")).toBe("dark");
  act(() => {
    localStorage.setItem("orbit.theme", "light");
    window.dispatchEvent(new StorageEvent("storage", { key: "orbit.theme" }));
  });
  expect(screen.getByLabelText("Theme")).toHaveValue("light");
  expect(document.documentElement).not.toHaveClass("dark");
});
