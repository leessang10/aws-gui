import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContextActions, copyAction } from "../src/shared-ui";
const open = () =>
  fireEvent.contextMenu(screen.getByRole("button", { name: "Resource" }), {
    clientX: 100,
    clientY: 100,
  });
test("opening a context menu never runs actions; disabled items cannot run", async () => {
  const run = vi.fn();
  render(
    <ContextActions
      actions={[
        { label: "Open", run },
        { label: "Unavailable", run, disabled: true },
      ]}
    >
      <button>Resource</button>
    </ContextActions>,
  );
  open();
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Unavailable" }));
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));
  await waitFor(() => expect(run).toHaveBeenCalledOnce());
});
test("keyboard opens a menu and Escape returns focus", async () => {
  render(
    <ContextActions
      actions={[
        { label: "First", run: vi.fn() },
        { label: "Disabled", disabled: true, run: vi.fn() },
        { label: "Last", run: vi.fn() },
      ]}
    >
      <button>Resource</button>
    </ContextActions>,
  );
  const source = screen.getByRole("button");
  source.focus();
  fireEvent.keyDown(source, { key: "F10", shiftKey: true });
  await screen.findByRole("menu");
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(source).toHaveFocus();
});
test("native input and selected-text context menus are preserved", () => {
  render(
    <ContextActions actions={[{ label: "Custom", run: vi.fn() }]}>
      <div>
        <input aria-label="Value" />
        <p>selected text</p>
      </div>
    </ContextActions>,
  );
  expect(fireEvent.contextMenu(screen.getByLabelText("Value"))).toBe(true);
  expect(screen.queryByRole("menu")).toBeNull();
  const range = document.createRange();
  range.selectNodeContents(screen.getByText("selected text"));
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  expect(window.getSelection()!.toString()).toBe("selected text");
  expect(fireEvent.contextMenu(screen.getByText("selected text"))).toBe(true);
  expect(screen.queryByRole("menu")).toBeNull();
  window.getSelection()!.removeAllRanges();
});
test("removing the source removes its portal menu", () => {
  const view = render(
    <ContextActions actions={[{ label: "Open", run: vi.fn() }]}>
      <button>Resource</button>
    </ContextActions>,
  );
  open();
  expect(screen.getByRole("menu")).toBeInTheDocument();
  view.unmount();
  expect(screen.queryByRole("menu")).toBeNull();
});
test("clipboard actions use targeted values and surface denied permissions", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <ContextActions actions={[copyAction("Copy ID", "target-id")]}>
      <button>Resource</button>
    </ContextActions>,
  );
  open();
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy ID" }));
  await screen.findByRole("alert");
  expect(writeText).toHaveBeenCalledWith("target-id");
  expect(screen.getByRole("alert")).toHaveTextContent("Clipboard denied");
});
