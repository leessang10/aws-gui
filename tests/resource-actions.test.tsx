import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResourceActions } from "../src/pages";
import { resourceActions } from "../src/resource-actions";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
beforeEach(() => {
  invoke.mockReset();
});
test("destructive form only prepares the exact selected resource", () => {
  const review = vi.fn();
  render(
    <ResourceActions
      service="ec2"
      row={{ InstanceId: "i-target" }}
      onReview={review}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Terminate instance" }));
  expect(review).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Prepare and review" }));
  expect(review).toHaveBeenCalledWith("terminate-instances", {
    InstanceIds: ["i-target"],
  });
  expect(invoke).not.toHaveBeenCalled();
});
test("snapshot rejects invalid names and cancel restores focus", () => {
  const review = vi.fn();
  render(
    <ResourceActions
      service="rds"
      row={{ DBInstanceIdentifier: "db-test" }}
      onReview={review}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Create snapshot" });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText("Snapshot name"), {
    target: { value: "invalid--name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare and review" }));
  expect(review).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("consecutive hyphens");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("Snapshot name")).toBeNull();
  expect(trigger).toHaveFocus();
});
test("cluster instances omit standalone lifecycle and snapshots", () => {
  expect(
    resourceActions("rds", {
      DBInstanceIdentifier: "db",
      DBClusterIdentifier: "cluster",
    }).map((a) => a.operation),
  ).toEqual(["reboot-db-instance"]);
});
test("versioning requires an explicit state and scopes the bucket", () => {
  const review = vi.fn();
  render(
    <ResourceActions
      service="s3api"
      row={{ Name: "selected-bucket" }}
      onReview={review}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Change versioning" }));
  fireEvent.click(screen.getByRole("button", { name: "Prepare and review" }));
  expect(review).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Versioning status"), {
    target: { value: "Suspended" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare and review" }));
  expect(review).toHaveBeenCalledWith("put-bucket-versioning", {
    Bucket: "selected-bucket",
    VersioningConfiguration: { Status: "Suspended" },
  });
});
