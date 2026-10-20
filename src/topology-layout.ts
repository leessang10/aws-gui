import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs";
import type { InfraGraph } from "./topology-data";
export type ViewMode = "icons" | "simple" | "detail";
export async function layoutTopology(graph: InfraGraph, mode: ViewMode) {
  const groups = new Set(
    graph.nodes
      .filter((n) => ["vpc", "subnet"].includes(n.kind))
      .map((n) => n.id),
  );
  const sizes =
    mode === "icons" ? [82, 76] : mode === "simple" ? [220, 86] : [280, 132];
  const elkNodes = new Map<string, ElkNode>(
    graph.nodes.map((n) => [
      n.id,
      {
        id: n.id,
        width: sizes[0],
        height: sizes[1],
        ...(groups.has(n.id)
          ? {
              children: [],
              layoutOptions: {
                "elk.padding": "[top=52,left=24,bottom=24,right=24]",
                "elk.algorithm": "layered",
                "elk.direction": "RIGHT",
                "elk.spacing.nodeNode": "70",
                "elk.layered.spacing.nodeNodeBetweenLayers": "130",
              },
            }
          : {}),
      },
    ]),
  );
  const children: ElkNode[] = [];
  for (const n of graph.nodes) {
    const item = elkNodes.get(n.id)!;
    const parent = n.parent ? elkNodes.get(n.parent) : undefined;
    if (parent?.children) parent.children.push(item);
    else children.push(item);
  }
  const elk = new ELK();
  const result = await elk.layout({
    id: "root",
    children,
    edges: graph.edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
      labels:
        mode === "icons" ? [] : [{ text: e.relation, width: 100, height: 20 }],
    })),
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "45",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
    },
  });
  const positions: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  function visit(items: ElkNode[]) {
    for (const n of items) {
      positions.push({
        id: n.id,
        x: n.x ?? 0,
        y: n.y ?? 0,
        width: n.width ?? sizes[0],
        height: n.height ?? sizes[1],
      });
      visit(n.children ?? []);
    }
  }
  visit(result.children ?? []);
  return positions;
}
