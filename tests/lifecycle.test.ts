// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const click = (id: string) => document.getElementById(id)!.click();
beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});
test("late resource response cannot replace a newly selected profile", async () => {
  let resolve!: (v: unknown) => void;
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "bootstrap")
      return Promise.resolve({
        profiles: ["first", "second"],
        version: "aws-cli/2",
      });
    if (cmd === "account_identity")
      return Promise.resolve({ Account: "123456789012" });
    return new Promise((r) => {
      resolve = r;
    });
  });
  await import("../src/main");
  await tick();
  click("refresh");
  const firstResolve = resolve;
  const select = document.querySelector<HTMLSelectElement>("#profile")!;
  select.value = "second";
  select.dispatchEvent(new Event("change"));
  firstResolve({ rows: [{ InstanceId: "i-old-account" }], nextToken: null });
  await tick();
  expect(document.body.textContent).not.toContain("i-old-account");
  resolve({ rows: [{ InstanceId: "i-new-account" }], nextToken: null });
  await tick();
  expect(document.body.textContent).toContain("i-new-account");
});
test("resource names are rendered as text, never executable markup", async () => {
  invoke.mockImplementation((cmd: string) =>
    Promise.resolve(
      cmd === "bootstrap"
        ? { profiles: ["default"], version: "aws-cli/2" }
        : cmd === "account_identity"
          ? { Account: "123456789012" }
          : {
              rows: [{ InstanceId: '<img src=x onerror="alert(1)">' }],
              nextToken: null,
            },
    ),
  );
  await import("../src/main");
  await tick();
  click("refresh");
  await tick();
  expect(document.querySelector("tbody img")).toBeNull();
  expect(document.querySelector("tbody")!.textContent).toContain("<img");
});
