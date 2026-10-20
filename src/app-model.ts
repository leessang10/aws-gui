import { t, locale, language } from "./i18n";
export type Row = Record<string, any>;
export type Service = "ec2" | "rds" | "s3" | "logs";
export type Page = { rows: Row[]; nextToken: string | null };
export type Cached = Page & { updated: number };
export type Route = {
  kind: "resources" | "catalog" | "settings" | "api" | "detail" | "topology";
  service?: string;
  resource?: Row;
  operation?: string;
  input?: Record<string, unknown>;
};
export type Context = {
  profile: string;
  region: string;
  demo: boolean;
  navigate: (route: Route) => void;
  clearCache: () => void;
};
export const text = (ko: string, en: string) => (language === "ko" ? ko : en);
export const resourceId = (row: Row) =>
  String(
    row.InstanceId ??
      row.DBInstanceIdentifier ??
      row.Name ??
      row.logGroupName ??
      JSON.stringify(row),
  );
export function cells(service: Service, row: Row): string[] {
  const date = (v: unknown) =>
    v ? new Date(v as string | number).toLocaleDateString(locale()) : "—";
  if (service === "ec2")
    return [
      row.Tags?.find((t: Row) => t.Key === "Name")?.Value || row.InstanceId,
      row.State?.Name || "unknown",
      row.InstanceType,
      row.Placement?.AvailabilityZone,
      row.PublicIpAddress || row.PrivateIpAddress || "—",
    ];
  if (service === "rds")
    return [
      row.DBInstanceIdentifier,
      row.DBInstanceStatus,
      `${row.Engine} ${row.EngineVersion || ""}`,
      row.DBInstanceClass,
      row.AvailabilityZone,
    ];
  if (service === "s3")
    return [
      row.Name,
      t("bucket"),
      date(row.CreationDate),
      t("accountWide"),
      row.BucketRegion || "—",
    ];
  return [
    row.logGroupName,
    t("group"),
    row.retentionInDays ? `${row.retentionInDays} ${t("days")}` : t("noExpiry"),
    `${((row.storedBytes || 0) / 1048576).toFixed(1)} MB`,
    date(row.creationTime),
  ];
}
export const fixtures: Record<Service, Row[]> = {
  ec2: [
    {
      InstanceId: "i-001",
      Tags: [{ Key: "Name", Value: "woojoo-api-production" }],
      State: { Name: "running" },
      InstanceType: "t3.medium",
      Placement: { AvailabilityZone: "ap-northeast-2a" },
      PrivateIpAddress: "10.0.1.24",
      PublicIpAddress: "203.0.113.24",
    },
    {
      InstanceId: "i-002",
      Tags: [{ Key: "Name", Value: "background-worker" }],
      State: { Name: "running" },
      InstanceType: "t3.small",
      Placement: { AvailabilityZone: "ap-northeast-2c" },
      PrivateIpAddress: "10.0.3.12",
    },
    {
      InstanceId: "i-003",
      Tags: [{ Key: "Name", Value: "staging-api" }],
      State: { Name: "stopped" },
      InstanceType: "t3.micro",
      Placement: { AvailabilityZone: "ap-northeast-2a" },
    },
  ],
  rds: [
    {
      DBInstanceIdentifier: "woojoo-postgres",
      DBInstanceStatus: "available",
      Engine: "postgres",
      EngineVersion: "16.4",
      DBInstanceClass: "db.t3.micro",
      AvailabilityZone: "ap-northeast-2a",
      Endpoint: { Address: "endpoint.example.invalid", Port: 5432 },
    },
  ],
  s3: [
    { Name: "woojoo-assets", CreationDate: "2026-09-12T09:00:00Z" },
    { Name: "woojoo-backups", CreationDate: "2026-09-18T09:00:00Z" },
  ],
  logs: [
    {
      logGroupName: "/aws/lambda/woojoo-api",
      retentionInDays: 30,
      storedBytes: 18400000,
      creationTime: 1789000000000,
    },
  ],
};
