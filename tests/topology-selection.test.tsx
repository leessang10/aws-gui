import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResourcePicker } from "../src/topology-picker";
import {
  topologyCandidates,
  searchCandidates,
  selectInventory,
  selectedTopology,
} from "../src/topology-selection";
import {
  collectTopology,
  hydrateTopology,
  type Inventory,
} from "../src/topology-data";
const inv: Inventory = {
  account: "123",
  profile: "test",
  region: "ap-northeast-2",
  collectedAt: "",
  warnings: [],
  items: {
    vpcs: [{ VpcId: "v1" }, { VpcId: "v2" }],
    subnets: [
      { SubnetId: "s1", VpcId: "v1" },
      { SubnetId: "s2", VpcId: "v2" },
    ],
    instances: [
      {
        InstanceId: "i1",
        SubnetId: "s1",
        VpcId: "v1",
        Tags: [{ Key: "Name", Value: "Web server" }],
      },
      { InstanceId: "i2", SubnetId: "s2", VpcId: "v2" },
    ],
    databases: [
      { DBInstanceIdentifier: "database", DBSubnetGroup: { VpcId: "v1" } },
    ],
    loadBalancers: [
      { LoadBalancerArn: "lb1", LoadBalancerName: "app", VpcId: "v1" },
      { LoadBalancerArn: "lb2", LoadBalancerName: "other", VpcId: "v2" },
    ],
    targetGroups: [
      {
        TargetGroupArn: "tg1",
        TargetGroupName: "web-targets",
        TargetType: "instance",
        VpcId: "v1",
        LoadBalancerArns: ["lb1"],
      },
    ],
    buckets: [{ Name: "assets" }, { Name: "other" }],
  },
  details: {
    "targets:tg1": {
      TargetHealthDescriptions: [
        { Target: { Id: "i1", Port: 80 }, TargetHealth: { State: "healthy" } },
      ],
    },
  },
};
test("blank search returns all candidates and combines name/type words", () => {
  const candidates = topologyCandidates(inv);
  expect(searchCandidates(candidates, "  ")).toHaveLength(candidates.length);
  expect(searchCandidates(candidates, "web ec2").map((n) => n.id)).toEqual([
    "i1",
  ]);
});
test("selected resources keep only their ancestor groups", () => {
  const ids = new Set(["i1"]),
    subset = selectInventory(inv, ids),
    graph = selectedTopology(subset, ids);
  expect(graph.nodes.map((n) => n.id).sort()).toEqual(["i1", "s1", "v1"]);
  expect(subset.items.instances).toHaveLength(1);
  expect(subset.items.buckets).toHaveLength(0);
  expect(graph.edges).toHaveLength(0);
});
test("relationships never add unchecked endpoints", () => {
  const ids = new Set(["tg1"]),
    subset = selectInventory(inv, ids);
  subset.details = inv.details;
  const graph = selectedTopology(subset, ids);
  expect(graph.nodes.map((n) => n.id).sort()).toEqual(["tg1", "v1"]);
  expect(graph.edges).toHaveLength(0);
  const both = new Set(["tg1", "i1", "lb1"]),
    full = selectInventory(inv, both);
  full.details = inv.details;
  expect(selectedTopology(full, both).edges).toHaveLength(2);
});
test("catalog lookup does not fetch relationship details", async () => {
  const read = vi.fn(async () => ({}));
  await collectTopology(
    read,
    { account: "123", profile: "test", region: "ap-northeast-2" },
    () => true,
    () => {},
    false,
  );
  expect(read.mock.calls).toHaveLength(7);
  expect(
    read.mock.calls.every((c) =>
      [
        "vpcs",
        "subnets",
        "instances",
        "databases",
        "loadBalancers",
        "targetGroups",
        "buckets",
      ].includes((c as unknown[])[0] as string),
    ),
  ).toBe(true);
});
test("detail lookups are scoped to selected resources", async () => {
  const read = vi.fn(async (kind: string) =>
    kind === "bucketLocation" ? { LocationConstraint: "ap-northeast-2" } : {},
  );
  await hydrateTopology(
    selectInventory(inv, new Set(["tg1", "s3:assets"])),
    read,
    () => true,
    () => {},
  );
  expect(read.mock.calls.map((c) => c[0]).sort()).toEqual([
    "bucketLocation",
    "bucketNotifications",
    "targets",
  ]);
});
test("checkboxes persist across searches; cancel does not load and load is explicit", () => {
  const onLoad = vi.fn(),
    onOpenChange = vi.fn();
  render(
    <ResourcePicker
      open
      inventory={inv}
      selectedIds={new Set()}
      busy={false}
      progress=""
      error=""
      profile="test"
      region="ap-northeast-2"
      onRefresh={vi.fn()}
      onLoad={onLoad}
      onOpenChange={onOpenChange}
    />,
  );
  expect(screen.getByRole("button", { name: "Load (0)" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "EC2 Web server" }));
  expect(onLoad).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Search resources"), {
    target: { value: "database" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "RDS database" }));
  fireEvent.change(screen.getByLabelText("Search resources"), {
    target: { value: "" },
  });
  expect(
    screen.getByRole("checkbox", { name: "EC2 Web server" }),
  ).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onLoad).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load (2)" }));
  expect(onLoad).toHaveBeenCalledWith(new Set(["i1", "rds:database"]), false);
});
test("select-all respects the current search", () => {
  const onLoad = vi.fn();
  render(
    <ResourcePicker
      open
      inventory={inv}
      selectedIds={new Set()}
      busy={false}
      progress=""
      error=""
      profile="test"
      region="ap-northeast-2"
      onRefresh={vi.fn()}
      onLoad={onLoad}
      onOpenChange={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Search resources"), {
    target: { value: "ec2" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all results" }));
  fireEvent.click(screen.getByRole("button", { name: "Load (2)" }));
  expect(onLoad).toHaveBeenCalledWith(new Set(["i1", "i2"]), false);
});

test("connected option follows EC2 registration to target group and load balancer", () => {
  const graph = selectedTopology(inv, new Set(["i1"]), true);
  expect(graph.nodes.map((n) => n.id).sort()).toEqual([
    "i1",
    "lb1",
    "s1",
    "tg1",
    "v1",
  ]);
  expect(graph.edges).toHaveLength(2);
  expect(graph.nodes.some((n) => n.id === "rds:database")).toBe(false);
});
test("group containment alone does not imply connectivity", () => {
  const graph = selectedTopology(inv, new Set(["v1"]), true);
  expect(graph.nodes.map((n) => n.id)).toEqual(["v1"]);
  expect(
    selectedTopology(inv, new Set(["i1"]), false)
      .nodes.map((n) => n.id)
      .sort(),
  ).toEqual(["i1", "s1", "v1"]);
});
test("connected option is opt-in and sent only on explicit load", () => {
  const onLoad = vi.fn();
  render(
    <ResourcePicker
      open
      inventory={inv}
      selectedIds={new Set(["i1"])}
      busy={false}
      progress=""
      error=""
      profile="test"
      region="ap-northeast-2"
      onRefresh={vi.fn()}
      onLoad={onLoad}
      onOpenChange={vi.fn()}
    />,
  );
  const toggle = screen.getByRole("checkbox", {
    name: "Include connected resources",
  });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(onLoad).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load (1)" }));
  expect(onLoad).toHaveBeenCalledWith(new Set(["i1"]), true);
});
