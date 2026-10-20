// Isolated browser fixture. This file is not imported by the production app.
import "../src/styles.css";

import Topology from "../src/topology";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
function mountTopology(host: Element, ctx: any, snapshot: any) {
  createRoot(host).render(createElement(Topology, { ...ctx, snapshot }));
}
mountTopology(
  document.querySelector("#diagram")!,
  {
    profile: "test",
    region: "ap-northeast-2",
    demo: true,
  },
  {
    account: "000000000000",
    profile: "test",
    region: "ap-northeast-2",
    collectedAt: "2026-10-21T00:00:00Z",
    warnings: [],
    items: {
      vpcs: [
        {
          VpcId: "vpc-test",
          CidrBlock: "10.0.0.0/16",
          Tags: [{ Key: "Name", Value: "Application VPC" }],
        },
      ],
      subnets: [
        {
          SubnetId: "subnet-test",
          VpcId: "vpc-test",
          AvailabilityZone: "ap-northeast-2a",
          CidrBlock: "10.0.1.0/24",
        },
      ],
      instances: [
        {
          InstanceId: "i-test",
          VpcId: "vpc-test",
          SubnetId: "subnet-test",
          InstanceType: "t3.micro",
          State: { Name: "running" },
          Tags: [{ Key: "Name", Value: "Web server" }],
        },
      ],
      databases: [
        {
          DBInstanceIdentifier: "app-db",
          Engine: "postgres",
          DBInstanceClass: "db.t3.micro",
          DBInstanceStatus: "available",
          DBSubnetGroup: { VpcId: "vpc-test" },
        },
      ],
      loadBalancers: [
        {
          LoadBalancerArn: "lb-test",
          LoadBalancerName: "web-alb",
          VpcId: "vpc-test",
          Type: "application",
          Scheme: "internet-facing",
        },
      ],
      targetGroups: [
        {
          TargetGroupArn: "tg-test",
          TargetGroupName: "web-targets",
          VpcId: "vpc-test",
          TargetType: "instance",
          Protocol: "HTTP",
          Port: 80,
          LoadBalancerArns: ["lb-test"],
        },
      ],
      buckets: [{ Name: "app-assets" }],
    },
    details: {
      "targets:tg-test": {
        TargetHealthDescriptions: [
          {
            Target: { Id: "i-test", Port: 80 },
            TargetHealth: { State: "healthy" },
          },
        ],
      },
      "bucketLocation:app-assets": { LocationConstraint: "ap-northeast-2" },
      "lbAttributes:lb-test": {
        Attributes: [
          { Key: "access_logs.s3.enabled", Value: "true" },
          { Key: "access_logs.s3.bucket", Value: "app-assets" },
        ],
      },
      "bucketNotifications:app-assets": {
        QueueConfigurations: [
          {
            QueueArn: "arn:aws:sqs:ap-northeast-2:000000000000:asset-events",
            Events: ["s3:ObjectCreated:*"],
          },
        ],
      },
    },
  },
);
