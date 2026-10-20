import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import {
  filterCatalog,
  readPreferences,
  rememberService,
} from "../src/workspace-state";
import { ApiWorkbench, Details } from "../src/pages";
import type { Context, Route } from "../src/app-model";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const ctx: Context = {
  demo: false,
  profile: "test",
  region: "us-east-1",
  navigate: vi.fn(),
  clearCache: vi.fn(),
};
const operations = [
  { name: "describe-instances", readOnly: true, supported: true, fields: [] },
];
const schema = {
  root: "Input",
  shapes: { Input: { type: "structure", members: {} } },
};
beforeEach(() => {
  invoke.mockReset();
});
test("catalog filters name and category together", () => {
  const rows = [
    { id: "lambda", name: "AWS Lambda", operations: 2 },
    { id: "rds", name: "Amazon Relational Database", operations: 3 },
  ];
  expect(filterCatalog(rows, "relational", "Database")).toEqual([rows[1]]);
  expect(filterCatalog(rows, "lambda", "Database")).toEqual([]);
});
test("invalid preferences recover and recent services stay bounded", () => {
  localStorage.setItem("orbit.workspace", "bad JSON");
  expect(readPreferences().favorites).toContain("ec2");
  for (let i = 0; i < 10; i++) rememberService(`service-${i}`);
  rememberService("service-9");
  expect(readPreferences().recent).toHaveLength(5);
});
test("review never executes and editing invalidates the confirmation", async () => {
  invoke.mockImplementation((cmd) =>
    Promise.resolve(
      cmd === "service_operations"
        ? operations
        : cmd === "api_input_schema"
          ? schema
          : { id: "1", account: "123456789012", phrase: "confirm" },
    ),
  );
  render(<ApiWorkbench ctx={ctx} route={{ kind: "api", service: "ec2" }} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review request" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
  await screen.findByLabelText("Type this phrase to confirm");
  expect(invoke.mock.calls.some((c) => c[0] === "execute_api")).toBe(false);
  expect(
    screen.getByRole("button", { name: "Execute reviewed request" }),
  ).toBeDisabled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON", exact: true }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.change(screen.getByLabelText("Request JSON"), {
    target: { value: '{"NextToken":"next"}' },
  });
  expect(screen.queryByLabelText("Type this phrase to confirm")).toBeNull();
});
test("late review cannot update a new context", async () => {
  let resolve!: (v: unknown) => void;
  invoke.mockImplementation((cmd) =>
    cmd === "service_operations"
      ? Promise.resolve(operations)
      : cmd === "api_input_schema"
        ? Promise.resolve(schema)
        : new Promise((r) => (resolve = r)),
  );
  const view = render(
    <ApiWorkbench ctx={ctx} route={{ kind: "api", service: "ec2" }} />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review request" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
  view.unmount();
  render(
    <ApiWorkbench
      ctx={{ ...ctx, profile: "second" }}
      route={{ kind: "api", service: "ec2" }}
    />,
  );
  await act(async () =>
    resolve({ id: "old", account: "old-account", phrase: "confirm" }),
  );
  expect(screen.queryByText("old-account")).toBeNull();
  expect(screen.queryByLabelText("Type this phrase to confirm")).toBeNull();
});
test("browser confirmation never calls AWS IPC", async () => {
  render(
    <ApiWorkbench
      ctx={{ ...ctx, demo: true }}
      route={{
        kind: "api",
        service: "ec2",
        operation: "create-tags",
        input: { Resources: ["i-test"] },
      }}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review request" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
  fireEvent.change(
    await screen.findByLabelText("Type this phrase to confirm"),
    { target: { value: "000000000000 ec2 create-tags" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Check request" }));
  await screen.findByText(/AWS connection unavailable/);
  expect(invoke).not.toHaveBeenCalled();
});
test("RDS editor creates a scoped payload without immediate application", async () => {
  const navigate = vi.fn();
  render(
    <Details
      ctx={{ ...ctx, navigate }}
      route={{
        kind: "detail",
        service: "rds",
        resource: {
          DBInstanceIdentifier: "db-test",
          Engine: "postgres",
          BackupRetentionPeriod: 7,
        },
      }}
    />,
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Actions & edit" }), {
    button: 0,
    ctrlKey: false,
  });
  await userEvent.click(
    await screen.findByLabelText("Backup retention (days)"),
  );
  await userEvent.click(
    screen.getByRole("option", { name: "14", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Prepare change" }));
  expect(navigate).toHaveBeenCalledWith({
    kind: "api",
    service: "rds",
    operation: "modify-db-instance",
    input: {
      DBInstanceIdentifier: "db-test",
      BackupRetentionPeriod: 14,
      ApplyImmediately: false,
    },
  });
});
test("Aurora hides cluster-only retention editor", () => {
  render(
    <Details
      ctx={ctx}
      route={{
        kind: "detail",
        service: "rds",
        resource: {
          DBInstanceIdentifier: "aurora-db",
          Engine: "aurora-postgresql",
        },
      }}
    />,
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Actions & edit" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.queryByRole("button", { name: "Prepare change" })).toBeNull();
});
test("single-use execution is locked against duplicate clicks", async () => {
  let finish!: (v: string) => void;
  invoke.mockImplementation((cmd) =>
    cmd === "service_operations"
      ? Promise.resolve(operations)
      : cmd === "api_input_schema"
        ? Promise.resolve(schema)
        : cmd === "prepare_api"
          ? Promise.resolve({ id: "single", account: "123", phrase: "confirm" })
          : new Promise((r) => (finish = r)),
  );
  render(<ApiWorkbench ctx={ctx} route={{ kind: "api", service: "ec2" }} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Review request" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
  fireEvent.change(
    await screen.findByLabelText("Type this phrase to confirm"),
    { target: { value: "confirm" } },
  );
  const button = screen.getByRole("button", {
    name: "Execute reviewed request",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(invoke.mock.calls.filter((c) => c[0] === "execute_api")).toHaveLength(
    1,
  );
  await act(async () => finish("{}"));
});
test("requested unavailable operation never falls back to another API", async () => {
  invoke.mockResolvedValue(operations);
  render(
    <ApiWorkbench
      ctx={ctx}
      route={{ kind: "api", service: "ec2", operation: "terminate-instances" }}
    />,
  );
  await screen.findByText("Operation not found.");
  expect(screen.getByRole("button", { name: "Review request" })).toBeDisabled();
});
