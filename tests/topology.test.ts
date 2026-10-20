import { expect, test } from "vitest";
import {
  buildTopology,
  collectTopology,
  type Inventory,
} from "../src/topology-data";
import { layoutTopology } from "../src/topology-layout";

function inventory(): Inventory {
  return {
    account: "123456789012",
    profile: "test",
    region: "ap-northeast-2",
    collectedAt: "",
    warnings: [],
    items: {
      vpcs: [{ VpcId: "vpc-1", CidrBlock: "10.0.0.0/16" }],
      subnets: [
        {
          SubnetId: "subnet-1",
          VpcId: "vpc-1",
          AvailabilityZone: "ap-northeast-2a",
        },
      ],
      instances: [
        {
          InstanceId: "i-1",
          VpcId: "vpc-1",
          SubnetId: "subnet-1",
          InstanceType: "t3.micro",
          PrivateIpAddress: "10.0.1.1",
        },
      ],
      databases: [
        {
          DBInstanceIdentifier: "db",
          DBInstanceClass: "db.t3.micro",
          Engine: "postgres",
          DBSubnetGroup: { VpcId: "vpc-1" },
        },
      ],
      loadBalancers: [
        { LoadBalancerArn: "lb-1", LoadBalancerName: "app", VpcId: "vpc-1" },
      ],
      targetGroups: [
        {
          TargetGroupArn: "tg-1",
          TargetGroupName: "targets",
          VpcId: "vpc-1",
          TargetType: "instance",
          LoadBalancerArns: ["lb-1"],
        },
      ],
      buckets: [
        { Name: "assets" },
        { Name: "other-region" },
        { Name: "unknown-region" },
      ],
    },
    details: {
      "targets:tg-1": {
        TargetHealthDescriptions: [
          {
            Target: { Id: "i-1", Port: 80 },
            TargetHealth: { State: "healthy" },
          },
        ],
      },
      "bucketLocation:assets": { LocationConstraint: "ap-northeast-2" },
      "bucketLocation:other-region": { LocationConstraint: "us-west-2" },
      "bucketNotifications:assets": {
        QueueConfigurations: [
          {
            QueueArn: "arn:aws:sqs:ap-northeast-2:123456789012:events",
            Events: ["s3:ObjectCreated:*"],
          },
        ],
      },
      "lbAttributes:lb-1": {
        Attributes: [
          { Key: "access_logs.s3.enabled", Value: "true" },
          { Key: "access_logs.s3.bucket", Value: "assets" },
        ],
      },
    },
  };
}
test("graph preserves containment, actual targets and S3 evidence without invented app connections", () => {
  const graph = buildTopology(inventory());
  expect(graph.nodes.find((n) => n.id === "i-1")?.parent).toBe("subnet-1");
  expect(graph.nodes.find((n) => n.id === "rds:db")?.parent).toBe("vpc-1");
  expect(graph.nodes.some((n) => n.id === "s3:other-region")).toBe(false);
  expect(graph.nodes.find((n) => n.id === "s3:unknown-region")?.subtitle).toBe(
    "Region unverified",
  );
  expect(graph.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: "lb-1", target: "tg-1" }),
      expect.objectContaining({
        source: "tg-1",
        target: "i-1",
        relation: "80 · healthy",
      }),
      expect.objectContaining({
        source: "lb-1",
        target: "s3:assets",
        relation: "access logs",
      }),
      expect.objectContaining({
        source: "s3:assets",
        target: "arn:aws:sqs:ap-northeast-2:123456789012:events",
      }),
    ]),
  );
  expect(
    graph.edges.some(
      (e) => e.source === "i-1" && ["rds:db", "s3:assets"].includes(e.target),
    ),
  ).toBe(false);
});
test("IP targets must match the VPC and ambiguous matches remain unresolved", () => {
  const inv = inventory();
  inv.items.targetGroups[0].TargetType = "ip";
  inv.details["targets:tg-1"].TargetHealthDescriptions[0].Target.Id =
    "10.0.1.1";
  expect(
    buildTopology(inv).edges.some(
      (e) => e.source === "tg-1" && e.target === "i-1",
    ),
  ).toBe(true);
  inv.items.instances[0].VpcId = "vpc-other";
  expect(
    buildTopology(inv).edges.some(
      (e) => e.source === "tg-1" && e.target === "i-1",
    ),
  ).toBe(false);
});
test("missing VPC permission does not leave invalid parent references", () => {
  const inv = inventory();
  inv.items.vpcs = [];
  const graph = buildTopology(inv);
  expect(
    graph.nodes
      .filter((n) => n.parent)
      .every((n) => graph.nodes.some((parent) => parent.id === n.parent)),
  ).toBe(true);
});
test("large inventories are visibly capped without dangling graph references", () => {
  const inv = inventory();
  inv.items.instances = Array.from({ length: 1100 }, (_, i) => ({
    InstanceId: `i-${i}`,
    VpcId: "vpc-1",
    SubnetId: "subnet-1",
  }));
  const graph = buildTopology(inv);
  expect(graph.nodes).toHaveLength(1000);
  expect(graph.warnings[0]).toContain("1000");
  expect(
    graph.edges.every(
      (e) =>
        graph.nodes.some((n) => n.id === e.source) &&
        graph.nodes.some((n) => n.id === e.target),
    ),
  ).toBe(true);
});
test("ELK lays out nested groups with external edges in all three view modes", async () => {
  const graph = buildTopology(inventory());
  for (const mode of ["icons", "simple", "detail"] as const) {
    const positions = await layoutTopology(graph, mode);
    expect(positions).toHaveLength(graph.nodes.length);
    expect(
      positions.every(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          p.width > 0 &&
          p.height > 0,
      ),
    ).toBe(true);
    // Parents precede children for React Flow's parentId handling.
    expect(positions.findIndex((n) => n.id === "vpc-1")).toBeLessThan(
      positions.findIndex((n) => n.id === "subnet-1"),
    );
    const group = positions.find((n) => n.id === "subnet-1")!;
    const instance = positions.find((n) => n.id === "i-1")!;
    expect(instance.x + instance.width).toBeLessThanOrEqual(group.width);
    expect(instance.y + instance.height).toBeLessThanOrEqual(group.height);
  }
});
test("collection follows cursors, keeps partial failures and never calls a write operation", async () => {
  const calls: string[] = [];
  const result = await collectTopology(
    async (kind, _resource, token) => {
      calls.push(kind);
      if (kind === "vpcs")
        return token
          ? { Vpcs: [{ VpcId: "vpc-2" }] }
          : { Vpcs: [{ VpcId: "vpc-1" }], NextToken: "next" };
      if (kind === "databases") throw new Error("AccessDenied");
      return {};
    },
    { account: "123", region: "ap-northeast-2", profile: "test" },
    () => true,
    () => {},
  );
  expect(result.items.vpcs).toHaveLength(2);
  expect(result.warnings).toContain("databases: Error: AccessDenied");
  expect(
    calls.every((k) =>
      [
        "vpcs",
        "subnets",
        "instances",
        "databases",
        "loadBalancers",
        "targetGroups",
        "buckets",
      ].includes(k),
    ),
  ).toBe(true);
});
test("repeated cursors are bounded and cancellation prevents additional reads", async () => {
  let calls = 0;
  const read = async () => {
    calls++;
    return { NextToken: "same" };
  };
  const result = await collectTopology(
    read,
    { account: "123", region: "us-east-1", profile: "test" },
    () => true,
    () => {},
  );
  expect(calls).toBe(14);
  expect(result.warnings).toHaveLength(7);
  calls = 0;
  await expect(
    collectTopology(
      read,
      { account: "123", region: "us-east-1", profile: "test" },
      () => calls === 0,
      () => {},
    ),
  ).rejects.toThrow("cancelled");
  expect(calls).toBe(1);
});
