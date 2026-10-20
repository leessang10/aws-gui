// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  bindContextMenu,
  closeContextMenu,
  copyAction,
} from "../src/context-menu";
import { setLanguage } from "../src/i18n";
let source: HTMLButtonElement;
const open = () =>
  source.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    }),
  );
const key = (key: string, shiftKey = false) =>
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
beforeEach(() => {
  document.body.innerHTML = '<button id="source">Resource</button>';
  source = document.querySelector("button")!;
  window.getSelection()?.removeAllRanges();
  setLanguage("en");
});
afterEach(() => {
  closeContextMenu();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
test("opening a menu never executes an action; disabled actions cannot run", () => {
  const run = vi.fn();
  bindContextMenu(source, () => [
    { label: "Open", run },
    { label: "Unavailable", run, disabled: true },
  ]);
  expect(open()).toBe(false);
  expect(run).not.toHaveBeenCalled();
  const buttons =
    document.querySelectorAll<HTMLButtonElement>("[role=menuitem]");
  buttons[1].click();
  expect(run).not.toHaveBeenCalled();
  buttons[0].click();
  expect(run).toHaveBeenCalledOnce();
  expect(document.querySelector("[role=menu]")).toBeNull();
});
test("Shift+F10, arrows and Escape handle focus and skip disabled entries", () => {
  bindContextMenu(source, () => [
    { label: "First", run: vi.fn() },
    { label: "Disabled", disabled: true, run: vi.fn() },
    { label: "Last", run: vi.fn() },
  ]);
  source.focus();
  key("F10", true);
  expect(document.activeElement!.textContent).toBe("First");
  key("ArrowDown");
  expect(document.activeElement!.textContent).toBe("Last");
  key("Home");
  expect(document.activeElement!.textContent).toBe("First");
  key("Escape");
  expect(document.activeElement).toBe(source);
  expect(document.querySelector("[role=menu]")).toBeNull();
});
test("native editing and selected-text context menus are preserved", () => {
  document.body.innerHTML = '<div id="root"><input><p>selected text</p></div>';
  const root = document.querySelector<HTMLElement>("#root")!;
  bindContextMenu(root, () => [{ label: "Custom", run: vi.fn() }]);
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  root.querySelector("input")!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  const range = document.createRange();
  range.selectNodeContents(root.querySelector("p")!);
  window.getSelection()!.addRange(range);
  const selected = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  root.querySelector("p")!.dispatchEvent(selected);
  expect(selected.defaultPrevented).toBe(false);
  expect(document.querySelector("[role=menu]")).toBeNull();
});
test("menu is clamped to the viewport and dismissed if its source is removed", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 240,
    height: 180,
    left: 0,
    top: 0,
    right: 240,
    bottom: 180,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  bindContextMenu(source, () => [{ label: "Open", run: vi.fn() }]);
  source.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 10000,
      clientY: 10000,
    }),
  );
  const menu = document.querySelector<HTMLElement>("[role=menu]")!;
  expect(parseFloat(menu.style.left)).toBe(window.innerWidth - 248);
  expect(parseFloat(menu.style.top)).toBe(window.innerHeight - 188);
  source.remove();
  await Promise.resolve();
  expect(document.querySelector("[role=menu]")).toBeNull();
});
test("copy uses the targeted data and reports clipboard denial honestly", async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  bindContextMenu(source, () => [copyAction("Copy ID", "target-id")]);
  open();
  document.querySelector<HTMLButtonElement>("[role=menuitem]")!.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(writeText).toHaveBeenCalledWith("target-id");
  expect(document.querySelector("[role=status]")!.textContent).toBe("Copied.");
  writeText.mockRejectedValue(new Error("Denied"));
  open();
  document.querySelector<HTMLButtonElement>("[role=menuitem]")!.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector("[role=status]")!.textContent).toContain(
    "Could not copy",
  );
});
test("modal menu stays inside dialog and outside pointer closes it", () => {
  const dialog = document.createElement("aside");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  dialog.append(source);
  bindContextMenu(source, () => [{ label: "Open", run: vi.fn() }]);
  open();
  expect(dialog.querySelector("[role=menu]")).not.toBeNull();
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(document.querySelector("[role=menu]")).toBeNull();
});
