import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { apiSchema } from "./api-schema-fixture";
import {
  descriptionText,
  parseApiInput,
  validateApiInput,
} from "../src/api-schema";
import { ApiRequestEditor } from "../src/api-request-editor";
import { ApiWorkbench } from "../src/pages";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => {
  invoke.mockReset().mockResolvedValue(apiSchema);
});

function Editor({
  operation = "create-resource",
  initial = "{}",
}: {
  operation?: string;
  initial?: string;
}) {
  const [input, setInput] = useState(initial);
  return (
    <>
      <ApiRequestEditor
        service="ec2"
        operation={operation}
        demo={false}
        fields={[]}
        input={input}
        disabled={false}
        onChange={setInput}
        onSchema={() => {}}
      />
      <output data-testid="input">{input}</output>
    </>
  );
}
const json = () => JSON.parse(screen.getByTestId("input").textContent!);
const tab = (name: string) =>
  fireEvent.mouseDown(screen.getByRole("tab", { name, exact: true }), {
    button: 0,
    ctrlKey: false,
  });

test("forms preserve omitted fields, explicit false and zero through JSON round trips", async () => {
  const user = userEvent.setup();
  render(<Editor initial={'{"Name":"sample","Extra":{"keep":true}}'} />);
  await screen.findByLabelText("Name");
  expect(screen.getByText("The name of the resource.")).toBeInTheDocument();
  expect(screen.getByText("Required")).toBeInTheDocument();
  expect(json()).not.toHaveProperty("Count");
  await user.click(screen.getByRole("checkbox", { name: "Count Include" }));
  fireEvent.change(screen.getByLabelText("Count"), { target: { value: "0" } });
  await user.click(screen.getByRole("checkbox", { name: "Enabled Include" }));
  await user.click(screen.getByRole("combobox", { name: "Enabled" }));
  await user.click(screen.getByRole("option", { name: "false", exact: true }));
  tab("JSON");
  expect(
    parseApiInput(
      (screen.getByLabelText("Request JSON") as HTMLTextAreaElement).value,
    ),
  ).toEqual({
    Name: "sample",
    Extra: { keep: true },
    Count: 0,
    Enabled: false,
  });
  tab("Form");
  expect(screen.getByLabelText("Count")).toHaveValue(0);
  await user.click(screen.getByRole("checkbox", { name: "Count Include" }));
  expect(json()).not.toHaveProperty("Count");
  expect(json().Enabled).toBe(false);
});

test("list objects and map entries are editable without writing JSON", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  await screen.findByLabelText("Name");
  await user.click(screen.getByRole("checkbox", { name: "Tags Include" }));
  await user.click(screen.getByRole("button", { name: "Add item" }));
  fireEvent.change(screen.getByLabelText("Tags[0].Key"), {
    target: { value: "team" },
  });
  await user.click(
    screen.getByRole("checkbox", { name: "Tags[0].Value Include" }),
  );
  fireEvent.change(screen.getByLabelText("Tags[0].Value"), {
    target: { value: "platform" },
  });
  await user.click(screen.getByRole("checkbox", { name: "Metadata Include" }));
  fireEvent.change(screen.getByLabelText("Metadata New key"), {
    target: { value: "owner" },
  });
  await user.click(screen.getByRole("button", { name: "Add", exact: true }));
  fireEvent.change(screen.getByLabelText("Metadata.owner"), {
    target: { value: "admin" },
  });
  expect(json()).toMatchObject({
    Tags: [{ Key: "team", Value: "platform" }],
    Metadata: { owner: "admin" },
  });
});

test("invalid JSON cannot switch to form or discard the draft", async () => {
  render(<Editor />);
  await screen.findByLabelText("Name");
  tab("JSON");
  fireEvent.change(screen.getByLabelText("Request JSON"), {
    target: { value: '{"Name":' },
  });
  tab("Form");
  expect(screen.getByLabelText("Request JSON")).toHaveValue('{"Name":');
});

test("late schema response cannot replace the newly selected operation", async () => {
  let resolve!: (value: unknown) => void;
  invoke.mockImplementation((_, args) =>
    args.operation === "old"
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve({
          root: "Empty",
          shapes: { Empty: { type: "structure", members: {} } },
        }),
  );
  const view = render(<Editor operation="old" />);
  view.rerender(<Editor operation="new" />);
  await screen.findByText("No input options.");
  await act(async () => resolve(apiSchema));
  expect(screen.queryByLabelText("Name")).toBeNull();
});

test("schema validation checks required, nested, enum, range and types without dropping unknown data", () => {
  expect(validateApiInput(apiSchema, {})).toContain("Name: Required.");
  const errors = validateApiInput(apiSchema, {
    Name: "ok",
    Count: 101,
    Enabled: "",
    Mode: "other",
    Tags: [{}],
  });
  expect(errors.join("\n")).toMatch(/Count: Maximum: 100/);
  expect(errors.join("\n")).toMatch(/Enabled: Choose true or false/);
  expect(errors.join("\n")).toMatch(/Mode: Choose an allowed value/);
  expect(errors.join("\n")).toMatch(/Tags\[0\].Key: Required/);
  expect(
    validateApiInput(apiSchema, {
      Name: "ok",
      Count: 0,
      Enabled: false,
      Extra: "preserved",
    }),
  ).toEqual([]);
});

test("AWS HTML descriptions become inert text", () => {
  expect(
    descriptionText(
      "<p>Use <code>Name</code> &amp; value.</p><script>alert(1)</script>",
    ),
  ).toBe("Use Name & value.");
});

test("missing required form values block review and later edits invalidate it", async () => {
  invoke.mockImplementation((cmd) =>
    Promise.resolve(
      cmd === "service_operations"
        ? [
            {
              name: "create-resource",
              readOnly: false,
              supported: true,
              fields: [],
            },
          ]
        : cmd === "api_input_schema"
          ? apiSchema
          : { id: "review", account: "test", phrase: "confirm" },
    ),
  );
  render(
    <ApiWorkbench
      ctx={{
        profile: "test",
        region: "ap-northeast-2",
        demo: false,
        navigate: vi.fn(),
        clearCache: vi.fn(),
      }}
      route={{ kind: "api", service: "ec2" }}
    />,
  );
  await screen.findByLabelText("Name");
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
  await screen.findByText(/Name: Required/);
  expect(invoke.mock.calls.some(([cmd]) => cmd === "prepare_api")).toBe(false);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "resource" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review request" }));
  await screen.findByLabelText("Type this phrase to confirm");
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "changed" },
  });
  await waitFor(() =>
    expect(screen.queryByLabelText("Type this phrase to confirm")).toBeNull(),
  );
  expect(invoke.mock.calls.some(([cmd]) => cmd === "execute_api")).toBe(false);
});
