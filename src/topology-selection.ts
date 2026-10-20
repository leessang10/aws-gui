import {
  buildTopology,
  type Inventory,
  type InfraGraph,
  type InfraNode,
  type RecordData,
} from "./topology-data";
const definitions: [
  string,
  string,
  (r: RecordData) => string,
  (r: RecordData) => string | undefined,
][] = [
  ["vpcs", "vpc", (r) => r.VpcId, () => undefined],
  ["subnets", "subnet", (r) => r.SubnetId, (r) => r.VpcId],
  ["instances", "ec2", (r) => r.InstanceId, (r) => r.SubnetId || r.VpcId],
  [
    "databases",
    "rds",
    (r) => r.DBInstanceArn || `rds:${r.DBInstanceIdentifier}`,
    (r) => r.DBSubnetGroup?.VpcId,
  ],
  ["loadBalancers", "elb", (r) => r.LoadBalancerArn, (r) => r.VpcId],
  ["targetGroups", "target", (r) => r.TargetGroupArn, (r) => r.VpcId],
  ["buckets", "s3", (r) => `s3:${r.Name}`, () => undefined],
];
export function topologyCandidates(inventory: Inventory): InfraNode[] {
  return definitions
    .flatMap(([key, kind, id, parent]) =>
      (inventory.items[key] ?? []).map((raw) => ({
        id: id(raw),
        kind,
        parent: parent(raw),
        name: String(
          raw.Tags?.find((t: RecordData) => t.Key === "Name")?.Value ||
            raw.DBInstanceIdentifier ||
            raw.LoadBalancerName ||
            raw.TargetGroupName ||
            raw.Name ||
            id(raw),
        ),
        subtitle: String(
          raw.InstanceType ||
            raw.Engine ||
            raw.CidrBlock ||
            raw.Type ||
            raw.TargetType ||
            "",
        ),
        raw,
      })),
    )
    .filter((r) => !!r.id);
}
export function searchCandidates(candidates: InfraNode[], query: string) {
  const words = query.toLowerCase().trim().split(/\s+/);
  return candidates.filter((n) =>
    words.every((word) =>
      `${n.name} ${n.id} ${n.kind} ${n.subtitle}`.toLowerCase().includes(word),
    ),
  );
}
function withParents(candidates: InfraNode[], ids: ReadonlySet<string>) {
  const byId = new Map(candidates.map((n) => [n.id, n]));
  const included = new Set<string>();
  const include = (id: string) => {
    if (included.has(id) || !byId.has(id)) return;
    included.add(id);
    const parent = byId.get(id)?.parent;
    if (parent) include(parent);
  };
  ids.forEach(include);
  return included;
}
export function selectInventory(
  inventory: Inventory,
  ids: ReadonlySet<string>,
): Inventory {
  const included = withParents(topologyCandidates(inventory), ids);
  return {
    ...inventory,
    details: {},
    warnings: [...inventory.warnings],
    items: Object.fromEntries(
      definitions.map(([key, , id]) => [
        key,
        (inventory.items[key] ?? []).filter((r) => included.has(id(r))),
      ]),
    ),
  };
}
export function selectedTopology(
  inventory: Inventory,
  ids: ReadonlySet<string>,
): InfraGraph {
  const graph = buildTopology(inventory),
    included = withParents(graph.nodes, ids);
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => included.has(n.id)),
    edges: graph.edges.filter(
      (e) => included.has(e.source) && included.has(e.target),
    ),
  };
}
