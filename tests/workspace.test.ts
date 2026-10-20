// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
import {
  filterCatalog,
  readPreferences,
  rememberService,
} from "../src/workspace-state";
import { mountWorkspace, type WorkspaceRoute } from "../src/workspace";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const tick = () => new Promise((r) => setTimeout(r, 0));
let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  document.body.innerHTML = "<main></main>";
  root = document.querySelector("main")!;
});
function mount(route: WorkspaceRoute, demo = false) {
  mountWorkspace(root, {
    route,
    demo,
    profile: "test",
    region: "us-east-1",
    navigate: vi.fn(),
    settingsChanged: vi.fn(),
    clearCache: vi.fn(),
  });
}
test("catalog filters name and category together", () => {
  const rows = [
    { id: "lambda", name: "AWS Lambda", operations: 2 },
    { id: "rds", name: "Amazon Relational Database", operations: 3 },
  ];
  expect(filterCatalog(rows, "relational", "Database")).toEqual([rows[1]]);
  expect(filterCatalog(rows, "lambda", "Database")).toEqual([]);
});
test("invalid stored preferences recover and recent services stay bounded", () => {
  localStorage.setItem("orbit.workspace", "bad JSON");
  expect(readPreferences().favorites).toContain("ec2");
  for (let i = 0; i < 10; i++) rememberService(`service-${i}`);
  rememberService("service-9");
  expect(readPreferences().recent).toHaveLength(5);
  expect(readPreferences().recent[0]).toBe("service-9");
});
test("review alone never executes and input edits invalidate confirmation", async () => {
  invoke.mockImplementation((command: string) =>
    Promise.resolve(
      command === "service_operations"
        ? [
            {
              name: "describe-instances",
              readOnly: true,
              supported: true,
              fields: [],
            },
          ]
        : {
            id: "1",
            account: "123456789012",
            phrase: "123456789012 ec2 describe-instances",
          },
    ),
  );
  mount({ kind: "api", service: "ec2" });
  await tick();
  root.querySelector<HTMLButtonElement>("#prepare-api")!.click();
  await tick();
  expect(root.querySelector("#api-confirm")).not.toBeNull();
  expect(invoke.mock.calls.some((c) => c[0] === "execute_api")).toBe(false);
  expect(root.querySelector<HTMLButtonElement>("#execute-api")!.disabled).toBe(
    true,
  );
  root.querySelector("#api-input")!.dispatchEvent(new Event("input"));
  expect(root.querySelector("#api-confirm")).toBeNull();
});
test("late review cannot update a detached context", async () => {
  let resolve!: (value: unknown) => void;
  invoke.mockImplementation((command: string) =>
    command === "service_operations"
      ? Promise.resolve([
          {
            name: "describe-instances",
            readOnly: true,
            supported: true,
            fields: [],
          },
        ])
      : new Promise((r) => (resolve = r)),
  );
  mount({ kind: "api", service: "ec2" });
  await tick();
  root.querySelector<HTMLButtonElement>("#prepare-api")!.click();
  root.remove();
  resolve({ id: "1", account: "123456789012", phrase: "confirm" });
  await tick();
  expect(root.querySelector("#api-confirm")).toBeNull();
});
test("preview execution never calls AWS IPC", async () => {
  mount(
    {
      kind: "api",
      service: "ec2",
      operation: "create-tags",
      input: { Resources: ["i-demo"], Tags: [{ Key: "Name", Value: "new" }] },
    },
    true,
  );
  await tick();
  root.querySelector<HTMLButtonElement>("#prepare-api")!.click();
  await tick();
  const field = root.querySelector<HTMLInputElement>("#api-confirm")!;
  field.value = "000000000000 ec2 create-tags";
  field.dispatchEvent(new Event("input"));
  root.querySelector<HTMLButtonElement>("#execute-api")!.click();
  await tick();
  expect(root.querySelector("#api-result")!.textContent).toContain("preview");
  expect(invoke).not.toHaveBeenCalled();
});

test("RDS editor creates a scoped payload without immediate application", () => {
  const navigate = vi.fn();
  mountWorkspace(root, {
    route: {
      kind: "detail",
      service: "rds",
      resource: {
        DBInstanceIdentifier: "demo-db",
        Engine: "postgres",
        BackupRetentionPeriod: 7,
      },
    },
    demo: true,
    profile: "test",
    region: "us-east-1",
    navigate,
    settingsChanged: vi.fn(),
    clearCache: vi.fn(),
  });
  root.querySelector<HTMLSelectElement>("#edit-value")!.value = "14";
  root.querySelector<HTMLButtonElement>("#edit-review")!.click();
  expect(navigate).toHaveBeenCalledWith({
    kind: "api",
    service: "rds",
    operation: "modify-db-instance",
    input: {
      DBInstanceIdentifier: "demo-db",
      BackupRetentionPeriod: 14,
      ApplyImmediately: false,
    },
  });
});
test("Aurora instance hides cluster-only retention editor", () => {
  mount(
    {
      kind: "detail",
      service: "rds",
      resource: {
        DBInstanceIdentifier: "aurora-demo",
        Engine: "aurora-postgresql",
      },
    },
    true,
  );
  expect(root.querySelector("#edit-review")).toBeNull();
});
