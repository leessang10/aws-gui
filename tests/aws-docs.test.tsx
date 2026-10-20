import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AwsDocsLink, awsDocsUrl } from "../src/aws-docs";
import { ApiWorkbench } from "../src/pages";

const { openUrl, invoke } = vi.hoisted(() => ({
  openUrl: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

test("documentation URLs map S3 to its API reference and escape path segments", () => {
  expect(awsDocsUrl("s3", "list-objects-v2")).toBe(
    "https://docs.aws.amazon.com/cli/latest/reference/s3api/list-objects-v2.html",
  );
  expect(awsDocsUrl("ec2")).toMatch(/ec2\/index.html$/);
  expect(awsDocsUrl("ec2", "bad?query#fragment")).toMatch(
    /bad%3Fquery%23fragment.html$/,
  );
});

test("desktop documentation opens externally and reports opener failures", async () => {
  const onError = vi.fn();
  openUrl.mockRejectedValueOnce(new Error("Browser unavailable"));
  render(
    <AwsDocsLink
      service="ec2"
      operation="describe-instances"
      desktop
      onError={onError}
    />,
  );
  fireEvent.click(screen.getByRole("link", { name: "AWS documentation" }));
  expect(openUrl).toHaveBeenCalledWith(awsDocsUrl("ec2", "describe-instances"));
  await waitFor(() =>
    expect(onError).toHaveBeenCalledWith("Error: Browser unavailable"),
  );
});

test("documentation follows the selected operation without executing AWS requests", async () => {
  invoke.mockReset().mockResolvedValue([
    { name: "describe-instances", readOnly: true, supported: true, fields: [] },
    { name: "create-tags", readOnly: false, supported: true, fields: [] },
  ]);
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
  await screen.findByRole("heading", { name: "describe-instances" });
  expect(
    screen.getByRole("link", { name: "AWS documentation" }),
  ).toHaveAttribute("href", awsDocsUrl("ec2", "describe-instances"));
  fireEvent.click(screen.getByRole("button", { name: /create-tags/ }));
  expect(
    screen.getByRole("link", { name: "AWS documentation" }),
  ).toHaveAttribute("href", awsDocsUrl("ec2", "create-tags"));
  expect(invoke.mock.calls.map(([command]) => command)).toEqual([
    "service_operations",
    "api_input_schema",
    "api_input_schema",
  ]);
});
