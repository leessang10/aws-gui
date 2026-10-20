export type Preferences = {
  favorites: string[];
  recent: string[];
  density: "comfortable" | "compact";
};
const defaults: Preferences = {
  favorites: ["ec2", "rds", "s3api", "logs"],
  recent: [],
  density: "comfortable",
};
export function readPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem("orbit.workspace") || "{}");
    const ids = (v: unknown, fallback: string[], max: number) =>
      Array.isArray(v)
        ? [
            ...new Set(
              v.filter(
                (s): s is string =>
                  typeof s === "string" && /^[a-z0-9-]+$/.test(s),
              ),
            ),
          ].slice(0, max)
        : fallback;
    return {
      favorites: ids(p.favorites, defaults.favorites, 8),
      recent: ids(p.recent, [], 5),
      density: p.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(p: Preferences) {
  localStorage.setItem("orbit.workspace", JSON.stringify(p));
}
export function rememberService(id: string) {
  const p = readPreferences();
  p.recent = [id, ...p.recent.filter((s) => s !== id)].slice(0, 5);
  savePreferences(p);
}
export type CatalogService = { id: string; name: string; operations: number };
export function category(id: string): string {
  if (
    /^(ec2|lambda|ecs|eks|ecr|batch|lightsail|elasticbeanstalk|autoscaling)/.test(
      id,
    )
  )
    return "Compute";
  if (/^(s3|efs|fsx|backup|glacier|storagegateway)/.test(id)) return "Storage";
  if (
    /^(rds|dynamodb|elasticache|redshift|neptune|docdb|timestream|memorydb)/.test(
      id,
    )
  )
    return "Database";
  if (
    /^(iam|sts|sso|kms|secretsmanager|cognito|guardduty|securityhub|waf|shield|acm)/.test(
      id,
    )
  )
    return "Security";
  if (
    /^(logs|cloudwatch|cloudtrail|config|ssm|cloudformation|organizations|health)/.test(
      id,
    )
  )
    return "Management";
  if (/^(route53|cloudfront|elb|apigateway|directconnect|network|vpc)/.test(id))
    return "Network";
  if (
    /^(bedrock|sagemaker|rekognition|polly|transcribe|translate|comprehend|textract|qbusiness)/.test(
      id,
    )
  )
    return "AI / ML";
  if (/^(athena|glue|emr|kinesis|firehose|opensearch|quicksight)/.test(id))
    return "Analytics";
  return "Other";
}
export function filterCatalog(
  items: CatalogService[],
  query: string,
  group: string,
) {
  const words = query.toLowerCase().trim().split(/\s+/);
  return items.filter(
    (s) =>
      (!group || category(s.id) === group) &&
      words.every((w) =>
        `${s.id} ${s.name} ${category(s.id)}`.toLowerCase().includes(w),
      ),
  );
}
