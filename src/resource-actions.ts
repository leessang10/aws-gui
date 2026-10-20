import { language } from "./i18n";

const text = (ko: string, en: string) => (language === "ko" ? ko : en);
type Row = Record<string, any>;
type Action = {
  operation: string;
  label: string;
  description: string;
  danger?: boolean;
  field?: { label: string; pattern?: string; options?: string[] };
  input: (value: string) => Record<string, unknown>;
};

export function resourceActions(service: string, row: Row): Action[] {
  const id = String(
    row.InstanceId ?? row.DBInstanceIdentifier ?? row.Name ?? row.logGroupName,
  );
  if (service === "ec2") {
    return [
      [
        "start-instances",
        text("시작", "Start"),
        text(
          "인스턴스를 시작합니다. 실행 비용이 발생합니다.",
          "Starts the instance and incurs running costs.",
        ),
      ],
      [
        "stop-instances",
        text("중지", "Stop"),
        text(
          "서비스가 중단됩니다. 인스턴스 스토어 데이터는 손실될 수 있습니다.",
          "Interrupts service. Instance store data can be lost.",
        ),
      ],
      [
        "reboot-instances",
        text("재부팅", "Reboot"),
        text(
          "재부팅 중 서비스가 일시 중단됩니다.",
          "Service is interrupted during reboot.",
        ),
      ],
      [
        "terminate-instances",
        text("인스턴스 종료", "Terminate instance"),
        text(
          "인스턴스를 영구 종료합니다. 종료 시 삭제하도록 설정된 볼륨도 삭제됩니다.",
          "Permanently terminates the instance and deletes volumes configured for deletion on termination.",
        ),
      ],
    ].map(([operation, label, description]) => ({
      operation,
      label,
      description,
      danger: operation === "terminate-instances",
      input: () => ({ InstanceIds: [id] }),
    }));
  }
  if (service === "rds") {
    const cluster =
      !!row.DBClusterIdentifier || String(row.Engine).startsWith("aurora");
    return [
      ...(!cluster
        ? [
            {
              operation: "start-db-instance",
              label: text("시작", "Start"),
              description: text(
                "DB 인스턴스를 시작합니다.",
                "Starts the DB instance.",
              ),
              input: () => ({ DBInstanceIdentifier: id }),
            },
            {
              operation: "stop-db-instance",
              label: text("중지", "Stop"),
              description: text(
                "DB 연결이 중단됩니다. 중지된 DB는 7일 후 자동 시작됩니다.",
                "Interrupts DB connections. Stopped databases automatically restart after seven days.",
              ),
              input: () => ({ DBInstanceIdentifier: id }),
            },
          ]
        : []),
      {
        operation: "reboot-db-instance",
        label: text("재부팅", "Reboot"),
        description: text(
          "재부팅 중 DB 연결이 중단됩니다.",
          "Interrupts DB connections during reboot.",
        ),
        input: () => ({ DBInstanceIdentifier: id }),
      },
      ...(!cluster
        ? [
            {
              operation: "create-db-snapshot",
              label: text("스냅샷 생성", "Create snapshot"),
              description: text(
                "수동 스냅샷을 생성합니다. 스토리지 비용이 발생할 수 있습니다.",
                "Creates a manual snapshot. Storage charges may apply.",
              ),
              field: {
                label: text("스냅샷 이름", "Snapshot name"),
                pattern: "[a-zA-Z][a-zA-Z0-9-]{0,254}",
              },
              input: (value: string) => {
                if (value.endsWith("-") || value.includes("--"))
                  throw new Error(
                    text(
                      "이름은 하이픈으로 끝나거나 연속 하이픈을 포함할 수 없습니다.",
                      "Names cannot end in a hyphen or contain consecutive hyphens.",
                    ),
                  );
                return {
                  DBInstanceIdentifier: id,
                  DBSnapshotIdentifier: value,
                };
              },
            },
          ]
        : []),
    ];
  }
  if (service === "s3api")
    return [
      {
        operation: "put-bucket-versioning",
        label: text("버전 관리 변경", "Change versioning"),
        description: text(
          "Enabled는 버전 관리를 활성화하고 Suspended는 중지합니다. 기존 버전은 유지되며 저장 비용이 발생할 수 있습니다.",
          "Enabled activates versioning; Suspended pauses it. Existing versions remain and may incur storage charges.",
        ),
        field: {
          label: text("버전 관리 상태", "Versioning status"),
          options: ["Enabled", "Suspended"],
        },
        input: (value) => ({
          Bucket: id,
          VersioningConfiguration: { Status: value },
        }),
      },
    ];
  if (service === "logs")
    return [
      {
        operation: "delete-retention-policy",
        label: text("보존 기간 제한 해제", "Retain indefinitely"),
        description: text(
          "로그를 만료 없이 보존합니다. 저장 비용이 증가할 수 있습니다.",
          "Retains logs indefinitely and may increase storage costs.",
        ),
        input: () => ({ logGroupName: id }),
      },
      {
        operation: "delete-log-group",
        label: text("로그 그룹 삭제", "Delete log group"),
        description: text(
          "그룹 안의 모든 로그 스트림과 이벤트를 영구 삭제합니다.",
          "Permanently deletes all log streams and events in this group.",
        ),
        danger: true,
        input: () => ({ logGroupName: id }),
      },
    ];
  return [];
}
