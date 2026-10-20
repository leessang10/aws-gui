import { useTheme } from "./theme";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ServiceIcon } from "./shared-ui";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { language } from "./i18n";

import {
  buildTopology,
  collectTopology,
  type Inventory,
  type InfraNode,
} from "./topology-data";
import { layoutTopology, type ViewMode } from "./topology-layout";
import "@xyflow/react/dist/style.css";
import "./topology.css";

const text = (ko: string, en: string) => (language === "ko" ? ko : en);
type Data = { resource: InfraNode; mode: ViewMode; label: string };
function ResourceNode({ data }: NodeProps<Node<Data>>) {
  const r = data.resource;
  return (
    <div
      className={`infra-card infra-${r.kind}`}
      title={`${r.name}\n${r.subtitle}\n${r.id}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="infra-icon">
        <ServiceIcon service={r.kind} />
      </span>
      <small>{r.kind.toUpperCase()}</small>
      {data.mode !== "icons" && <strong>{r.name}</strong>}
      {data.mode === "detail" && (
        <>
          <span>{r.subtitle}</span>
          <code>{r.id}</code>
        </>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
      <Handle
        id="logs-out"
        type="source"
        position={Position.Top}
        isConnectable={false}
      />
      <Handle
        id="logs-in"
        type="target"
        position={Position.Top}
        isConnectable={false}
      />
    </div>
  );
}
function GroupNode({ data }: NodeProps<Node<Data>>) {
  return (
    <div className="infra-group-label" title={data.resource.id}>
      {data.label}
    </div>
  );
}
const nodeTypes = { resource: ResourceNode, group: GroupNode };
function FitLayout({ version }: { version: number }) {
  const ready = useNodesInitialized();
  const flow = useReactFlow();
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.15, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, version, flow]);
  return null;
}
type Context = { profile: string; region: string; demo: boolean };
export default function Topology(ctx: Context & { snapshot?: Inventory }) {
  const { resolved } = useTheme();
  const [inventory, setInventory] = useState<Inventory | undefined>(
    ctx.snapshot,
  );
  const [nodes, setNodes] = useState<Node<Data>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [graphWarnings, setGraphWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<ViewMode>("simple");
  const [busy, setBusy] = useState(false);
  const [layingOut, setLayingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [download, setDownload] = useState<{ url: string; filename: string }>();
  const [saveStatus, setSaveStatus] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InfraNode>();
  const [filter, setFilter] = useState("");
  const [revision, setRevision] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [flow, setFlow] = useState<any>();
  const epoch = useRef(0);
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  async function collect() {
    const generation = ++epoch.current;
    const active = () => generation === epoch.current;
    setBusy(true);
    setError("");
    setSelected(undefined);
    setDownload(undefined);
    setSaveStatus("");
    setInventory(undefined);
    setNodes([]);
    setEdges([]);
    try {
      if (ctx.demo)
        throw new Error(
          text(
            "AWS에 연결한 뒤 구조도를 조회하세요.",
            "AWS connection required.",
          ),
        );
      const query = {
        service: "ec2",
        profile: ctx.profile,
        region: ctx.region,
      };
      const identity = await invoke<{ Account: string }>("account_identity", {
        query,
      });
      if (!active()) return;
      if (!identity.Account)
        throw new Error("AWS account identity unavailable");
      const collected = await collectTopology(
        (kind, resource, nextToken) =>
          invoke("topology_query", {
            query: { ...query, kind, resource, nextToken },
          }),
        { account: identity.Account, profile: ctx.profile, region: ctx.region },
        active,
        (value) => {
          if (active()) setProgress(value);
        },
      );
      const after = await invoke<{ Account: string }>("account_identity", {
        query,
      });
      if (!active()) return;
      if (after.Account !== identity.Account)
        throw new Error(
          text(
            "조회 중 AWS 계정이 변경되었습니다. 다시 조회하세요.",
            "AWS account changed during collection. Collect again.",
          ),
        );
      setInventory(collected);
    } catch (e) {
      if (active()) setError(String(e));
    } finally {
      if (active()) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  useEffect(() => {
    if (!inventory) return;
    let active = true;
    setLayingOut(true);
    setError("");
    const graph = buildTopology(inventory);
    setGraphWarnings(graph.warnings);
    layoutTopology(graph, mode)
      .then((positions) => {
        if (!active) return;
        const byId = new Map(graph.nodes.map((n) => [n.id, n]));
        setNodes(
          positions.map((p) => {
            const r = byId.get(p.id)!;
            const group = ["vpc", "subnet"].includes(r.kind);
            return {
              id: r.id,
              parentId: r.parent,
              extent: r.parent ? ("parent" as const) : undefined,
              type: group ? "group" : "resource",
              position: { x: p.x, y: p.y },
              style: { width: p.width, height: p.height },
              className: group ? `infra-group infra-${r.kind}` : "",
              data: {
                resource: r,
                mode,
                label: `${r.kind.toUpperCase()} · ${r.name}${mode === "detail" ? ` · ${r.subtitle}` : ""}`,
              },
              ariaLabel: `${r.kind}: ${r.name}. ${r.subtitle}`,
            };
          }),
        );
        setLayoutVersion((v) => v + 1);
        setEdges(
          graph.edges.map((e) => ({
            ...e,
            label:
              mode === "icons"
                ? undefined
                : e.relation.includes("s3:")
                  ? "S3 event"
                  : e.relation,
            sourceHandle: e.relation === "access logs" ? "logs-out" : undefined,
            targetHandle: e.relation === "access logs" ? "logs-in" : undefined,
            data: { relation: e.relation },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "var(--diagram-edge)",
            },
            type: "smoothstep",
            pathOptions: { offset: 40 },
            style: { stroke: "var(--diagram-edge)" },
            labelStyle: { fontSize: 11, fill: "var(--foreground)" },
            labelBgStyle: { fill: "var(--diagram-node)", fillOpacity: 1 },
            labelBgPadding: [5, 3],
          })),
        );
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLayingOut(false);
      });
    return () => {
      active = false;
    };
  }, [inventory, mode, revision]);
  async function exportImage(format: "png" | "pdf") {
    if (!canvas.current || !nodes.length) return;
    setExporting(true);
    setDownload(undefined);
    setSaveStatus("");
    setError("");
    try {
      const viewport = canvas.current.querySelector<HTMLElement>(
        ".react-flow__viewport",
      )!;
      // Resolve parent-relative positions so exports include every group and node,
      // regardless of the currently visible pan/zoom area or manual placements.
      const map = new Map(nodes.map((n) => [n.id, n]));
      function absolute(n: Node<Data>): { x: number; y: number } {
        const parent = n.parentId && map.get(n.parentId);
        const p = parent ? absolute(parent) : { x: 0, y: 0 };
        return { x: n.position.x + p.x, y: n.position.y + p.y };
      }
      const bounds = nodes.map((n) => ({
        ...absolute(n),
        w: Number(n.style?.width ?? 280),
        h: Number(n.style?.height ?? 132),
      }));
      const minX = Math.min(...bounds.map((n) => n.x)),
        minY = Math.min(...bounds.map((n) => n.y));
      const width = Math.max(...bounds.map((n) => n.x + n.w)) - minX + 80;
      const height = Math.max(...bounds.map((n) => n.y + n.h)) - minY + 80;
      const scale = Math.min(
        1,
        6000 / width,
        6000 / height,
        Math.sqrt(16000000 / (width * height)),
      );
      const { toPng } = await import("html-to-image");
      await document.fonts.ready;
      const png = await toPng(viewport, {
        backgroundColor: getComputedStyle(canvas.current)
          .getPropertyValue("--diagram-canvas")
          .trim(),
        width: Math.ceil(width * scale),
        height: Math.ceil(height * scale),
        pixelRatio: 1,
        skipFonts: true,
        style: {
          transform: `translate(${(40 - minX) * scale}px, ${(40 - minY) * scale}px) scale(${scale})`,
          transformOrigin: "0 0",
          width: `${width}px`,
          height: `${height}px`,
        },
        filter: (element) =>
          !(
            element instanceof HTMLElement &&
            element.classList.contains("react-flow__handle")
          ),
      });
      const filename = `orbit-infrastructure-${ctx.region}-${new Intl.DateTimeFormat("sv-SE").format(new Date())}`;
      let url = png;
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const w = width * scale,
          h = height * scale;
        const pdf = new jsPDF({
          orientation: w > h + 55 ? "landscape" : "portrait",
          unit: "px",
          format: [w, h + 55],
          hotfixes: ["px_scaling"],
        });
        pdf.setFillColor(resolved === "dark" ? "#141920" : "#fafbfc");
        pdf.rect(0, 0, w, h + 55, "F");
        pdf.setTextColor(resolved === "dark" ? "#e2e7ef" : "#24272d");
        pdf.setFontSize(10);
        pdf.text(
          `AWS ${inventory?.account} | ${ctx.region} | ${inventory?.collectedAt}`,
          20,
          20,
        );
        pdf.text(
          `Partial collection warnings: ${(inventory?.warnings.length ?? 0) + graphWarnings.length}`,
          20,
          37,
        );
        pdf.addImage(png, "PNG", 0, 55, w, h);
        url = pdf.output("datauristring");
      }
      if (isTauri()) {
        const binary = atob(url.slice(url.indexOf(",") + 1));
        const saved = await invoke<string | null>("save_diagram", {
          format,
          bytes: Array.from(binary, (ch) => ch.charCodeAt(0)),
        });
        setSaveStatus(
          saved
            ? `${text("저장 완료", "Saved")}: ${saved}`
            : text("저장 취소", "Save cancelled"),
        );
      } else {
        setDownload({ url, filename: `${filename}.${format}` });
      }
    } catch (e) {
      setError(`${text("내보내기 실패", "Export failed")}: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }
  const counts =
    inventory &&
    Object.entries(inventory.items).filter(([k]) =>
      ["instances", "databases", "loadBalancers", "targetGroups"].includes(k),
    );
  return (
    <div className="topology-page">
      <div className="page-heading">
        <div>
          <h1>{text("인프라 구조도", "Infrastructure map")}</h1>
          <p>
            {ctx.profile} · {ctx.region}
            {inventory ? ` · ${inventory.account}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          className="primary"
          onClick={collect}
          disabled={busy || !ctx.profile}
        >
          {text("구조도 조회", "Collect infrastructure")}
        </Button>
        {busy && (
          <Button
            variant="outline"
            className="quiet"
            onClick={() => {
              epoch.current++;
              setBusy(false);
              setProgress("");
            }}
          >
            {text("수집 중지", "Stop collection")}
          </Button>
        )}
      </div>

      <div className="topology-toolbar">
        <NativeSelect
          aria-label={text("보기", "View")}
          value={mode}
          onChange={(e) => setMode(e.target.value as ViewMode)}
          disabled={exporting}
        >
          <option value="icons">{text("아이콘만", "Icons")}</option>
          <option value="simple">{text("간단히", "Simple")}</option>
          <option value="detail">{text("상세", "Detailed")}</option>
        </NativeSelect>

        <Button
          variant="outline"
          className="quiet"
          onClick={() => setRevision((r) => r + 1)}
          disabled={!inventory || layingOut || exporting}
        >
          {text("자동 정렬", "Auto layout")}
        </Button>
        <Button
          variant="outline"
          className="quiet"
          onClick={() => flow?.fitView({ padding: 0.15 })}
        >
          {text("전체 맞춤", "Fit all")}
        </Button>
        <Input
          aria-label={text("리소스 찾기", "Find resource")}
          placeholder={text("이름 또는 ID 검색", "Find name or ID")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button
          variant="outline"
          className="quiet"
          disabled={!nodes.length || busy || layingOut || exporting}
          onClick={() => exportImage("png")}
        >
          PNG
        </Button>
        <Button
          variant="outline"
          className="quiet"
          disabled={!nodes.length || busy || layingOut || exporting}
          onClick={() => exportImage("pdf")}
        >
          PDF
        </Button>
      </div>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {download && (
        <p>
          <a download={download.filename} href={download.url}>
            {text("파일 저장", "Save file")} · {download.filename}
          </a>
        </p>
      )}
      {saveStatus && <p role="status">{saveStatus}</p>}
      <div role="status" className="topology-status">
        {busy
          ? `${text("조회 중", "Collecting")} · ${progress}`
          : layingOut
            ? text("자동 배치 중…", "Arranging…")
            : exporting
              ? text("내보내는 중…", "Exporting…")
              : inventory
                ? `${counts?.map(([k, v]) => `${({ instances: "EC2", databases: "RDS", loadBalancers: "ELB", targetGroups: "Target groups" } as Record<string, string>)[k]} ${v.length}`).join(" · ")} · S3 ${nodes.filter((n) => n.data.resource.kind === "s3").length} · ${new Date(inventory.collectedAt).toLocaleString()}`
                : null}
      </div>
      {inventory && inventory.warnings.length + graphWarnings.length > 0 && (
        <details className="topology-warnings">
          <summary>
            {text("조회 오류", "Collection issues")} ·{" "}
            {inventory.warnings.length + graphWarnings.length}
          </summary>

          {[...inventory.warnings, ...graphWarnings].map((w, i) => (
            <pre key={i}>{w}</pre>
          ))}
        </details>
      )}
      <div className="topology-body">
        <div className="topology-canvas" ref={canvas}>
          <ReactFlow
            colorMode={resolved}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlow}
            onNodesChange={(changes) =>
              setNodes((current) => applyNodeChanges(changes, current))
            }
            onNodeClick={(_, node) => setSelected(node.data.resource)}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            nodesDraggable={!exporting && !layingOut}
            minZoom={0.03}
            maxZoom={2}
            fitView
          >
            <FitLayout version={layoutVersion} />
            <Background />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor="var(--diagram-minimap-node)"
              maskColor="var(--diagram-mask)"
            />
          </ReactFlow>
          {inventory && !busy && !layingOut && !nodes.length && (
            <div className="topology-empty">
              {text("리소스 없음", "No resources")}
            </div>
          )}
        </div>
        {(selected || filter.trim()) && (
          <aside className="topology-inspector">
            {filter && (
              <div className="topology-results">
                {nodes
                  .filter((n) =>
                    `${n.data.resource.name} ${n.id}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )
                  .slice(0, 50)
                  .map((n) => (
                    <Button
                      variant="outline"
                      className="quiet"
                      key={n.id}
                      onClick={() => {
                        setSelected(n.data.resource);
                        flow?.fitView({
                          nodes: [{ id: n.id }],
                          padding: 0.6,
                          maxZoom: 1,
                        });
                      }}
                    >
                      {n.data.resource.name}
                    </Button>
                  ))}
              </div>
            )}
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h2>{selected.name}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelected(undefined);
                      setFilter("");
                    }}
                  >
                    {text("닫기", "Close")}
                  </Button>
                </div>
                <p>
                  {selected.kind.toUpperCase()} · {selected.subtitle}
                </p>
                <code>{selected.id}</code>
                <h3>{text("연결 관계", "Relationships")}</h3>
                {edges
                  .filter(
                    (e) => e.source === selected.id || e.target === selected.id,
                  )
                  .map((e) => (
                    <p key={e.id}>
                      {e.source === selected.id ? "→ " : "← "}
                      {
                        nodes.find(
                          (n) =>
                            n.id ===
                            (e.source === selected.id ? e.target : e.source),
                        )?.data.resource.name
                      }{" "}
                      · {String(e.data?.relation ?? "")}
                    </p>
                  ))}
                <h3>{text("AWS 응답", "AWS response")}</h3>
                <pre>{JSON.stringify(selected.raw, null, 2)}</pre>
              </>
            ) : null}
          </aside>
        )}
      </div>
    </div>
  );
}
