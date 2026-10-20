// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
import { mountResourceActions, resourceActions } from "../src/resource-actions";
import { mountWorkspace } from "../src/workspace";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => {
  document.body.innerHTML = "<main></main>";
  invoke.mockReset();
});
test("destructive action opens a form and only navigates to review with the exact resource", () => {
  const navigate = vi.fn();
  const root = document.querySelector("main")!;
  mountWorkspace(root, {
    route: {
      kind: "detail",
      service: "ec2",
      resource: { InstanceId: "i-target" },
    },
    demo: false,
    profile: "test",
    region: "ap-northeast-2",
    navigate,
    settingsChanged: vi.fn(),
    clearCache: vi.fn(),
  });
  root.querySelector<HTMLButtonElement>(".danger-action")!.click();
  expect(invoke).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  root.querySelector<HTMLFormElement>(".action-form form")!.requestSubmit();
  expect(navigate).toHaveBeenCalledWith({
    kind: "api",
    service: "ec2",
    operation: "terminate-instances",
    input: { InstanceIds: ["i-target"] },
  });
  expect(invoke).not.toHaveBeenCalled();
});
test("snapshot name rejects invalid input and cancellation creates no request", () => {
  const review = vi.fn();
  const root = document.querySelector("main")!;
  mountResourceActions(
    root,
    "rds",
    { DBInstanceIdentifier: "db-test" },
    review,
  );
  root.querySelector<HTMLButtonElement>('[data-action="3"]')!.click();
  const input = root.querySelector<HTMLInputElement>("input")!;
  input.value = "invalid--name";
  root.querySelector<HTMLFormElement>("form")!.requestSubmit();
  expect(review).not.toHaveBeenCalled();
  expect(root.querySelector('[role="alert"]')!.textContent).not.toBe("");
  root.querySelector<HTMLButtonElement>("[data-cancel]")!.click();
  expect(root.querySelector("form")).toBeNull();
  expect(review).not.toHaveBeenCalled();
});
test("cluster instances do not offer standalone lifecycle or snapshot actions", () => {
  const actions = resourceActions("rds", {
    DBInstanceIdentifier: "db",
    DBClusterIdentifier: "cluster",
  });
  expect(actions.map((a) => a.operation)).toEqual(["reboot-db-instance"]);
});
test("versioning requires an explicit choice and targets only the selected bucket", () => {
  const review = vi.fn();
  const root = document.querySelector("main")!;
  mountResourceActions(root, "s3api", { Name: "selected-bucket" }, review);
  root.querySelector<HTMLButtonElement>("[data-action]")!.click();
  const form = root.querySelector("form")!;
  form.requestSubmit();
  expect(review).not.toHaveBeenCalled();
  root.querySelector("select")!.value = "Suspended";
  form.requestSubmit();
  expect(review).toHaveBeenCalledWith("put-bucket-versioning", {
    Bucket: "selected-bucket",
    VersioningConfiguration: { Status: "Suspended" },
  });
});
