import { beforeEach, expect, test, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import App, { Resources } from "../src/app";
import Explorer from "../src/explorer-view";
import type { Context } from "../src/app-model";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));
beforeEach(() => {
  invoke.mockReset();
});
const ctx: Context = {
  profile: "first",
  region: "us-east-1",
  demo: false,
  navigate: vi.fn(),
  clearCache: vi.fn(),
};
test("late resource response cannot replace the selected profile", async () => {
  let resolveOld!: (v: unknown) => void;
  invoke.mockImplementation((cmd, args) =>
    cmd === "bootstrap"
      ? Promise.resolve({ profiles: ["first", "second"], version: "aws-cli/2" })
      : cmd === "account_identity"
        ? Promise.resolve({ Account: "123456789012" })
        : args.query.profile === "first"
          ? new Promise((r) => (resolveOld = r))
          : Promise.resolve({
              rows: [{ InstanceId: "i-new-account" }],
              nextToken: null,
            }),
  );
  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText("Profile")).toHaveValue("first"),
  );
  fireEvent.change(screen.getByLabelText("Profile"), {
    target: { value: "second" },
  });
  await screen.findByText("i-new-account");
  await act(async () =>
    resolveOld({ rows: [{ InstanceId: "i-old-account" }], nextToken: null }),
  );
  expect(screen.queryByText("i-old-account")).toBeNull();
});
test("resource markup stays inert text", async () => {
  invoke.mockResolvedValue({
    rows: [{ InstanceId: '<img src=x onerror="alert(1)">' }],
    nextToken: null,
  });
  const view = render(<Resources ctx={ctx} service="ec2" cache={new Map()} />);
  await screen.findByText('<img src=x onerror="alert(1)">');
  expect(view.container.querySelector("tbody img")).toBeNull();
});
test("S3 pagination retains prefix and deduplicates objects", async () => {
  invoke.mockImplementation((_, args) =>
    Promise.resolve(
      args.query.nextToken
        ? {
            rows: [
              { kind: "file", Key: "assets/a.json" },
              { kind: "file", Key: "assets/b.json" },
            ],
            nextToken: "same",
          }
        : args.query.prefix
          ? {
              rows: [{ kind: "file", Key: "assets/a.json" }],
              nextToken: "same",
            }
          : { rows: [{ kind: "folder", Prefix: "assets/" }], nextToken: null },
    ),
  );
  render(<Explorer {...ctx} service="s3" resource="bucket" />);
  fireEvent.click(await screen.findByRole("button", { name: /assets\// }));
  await screen.findByText("a.json");
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await screen.findByText("b.json");
  expect(screen.getAllByText("a.json")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  expect(invoke.mock.calls.at(-1)?.[1].query).toMatchObject({
    prefix: "assets/",
    resource: "bucket",
    nextToken: "same",
  });
});
test("log paging freezes time and filter until apply", async () => {
  invoke.mockResolvedValue({
    rows: [
      {
        eventId: "e1",
        message: "hello",
        timestamp: 1,
        logStreamName: "stream",
      },
    ],
    nextToken: "next",
  });
  render(<Explorer {...ctx} service="logs" resource="group" />);
  await screen.findByText("hello");
  const first = invoke.mock.calls[0][1].query;
  fireEvent.change(screen.getByLabelText("CloudWatch filter pattern"), {
    target: { value: "ERROR" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  expect(invoke.mock.calls[1][1].query).toMatchObject({
    startTime: first.startTime,
    endTime: first.endTime,
    pattern: "",
  });
});

test("region changes discard resource-specific drafts before another request", async () => {
  invoke.mockImplementation((cmd: string) =>
    Promise.resolve(
      cmd === "bootstrap"
        ? { profiles: ["first"], version: "aws-cli/2" }
        : cmd === "account_identity"
          ? { Account: "123456789012" }
          : cmd === "service_operations"
            ? [
                {
                  name: "describe-instances",
                  readOnly: true,
                  supported: true,
                  fields: [],
                },
              ]
            : { rows: [], nextToken: null },
    ),
  );
  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText("Profile")).toHaveValue("first"),
  );
  fireEvent.click(screen.getByRole("button", { name: "API workbench" }));
  const input = await screen.findByLabelText("Request JSON");
  fireEvent.change(input, {
    target: { value: '{"InstanceIds":["i-old-region"]}' },
  });
  const region = screen.getByLabelText("Region");
  fireEvent.change(region, { target: { value: "us-west-2" } });
  fireEvent.blur(region);
  await waitFor(() =>
    expect(screen.queryByLabelText("Request JSON")).toBeNull(),
  );
  expect(
    invoke.mock.calls.some(
      (c) => c[0] === "prepare_api" || c[0] === "execute_api",
    ),
  ).toBe(false);
  await waitFor(() =>
    expect(
      invoke.mock.calls.some(
        (c) => c[0] === "list_resources" && c[1].query.region === "us-west-2",
      ),
    ).toBe(true),
  );
});
