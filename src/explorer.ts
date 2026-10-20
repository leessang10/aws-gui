import { invoke } from "@tauri-apps/api/core";
import "./explorer.css";
import { mergeRows } from "./pagination";
import { t, locale, type Message } from "./i18n";

type Row = Record<string, any>;
type Page = { rows: Row[]; nextToken: string | null };
type Context = {
  profile: string;
  region: string;
  demo: boolean;
  service: "s3" | "logs";
  resource: string;
};
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;

export function mountExplorer(root: HTMLElement, ctx: Context) {
  let rows: Row[] = [],
    next: string | null = null,
    prefix = "",
    error = "",
    busy = false,
    generation = 0;
  let hours = 24,
    pattern = "",
    end = Date.now(),
    start = end - hours * 3600000;
  let detail: Row | null = null;
  let shown = false;
  let appliedPattern = "";
  const isS3 = ctx.service === "s3";
  function demoPage(): Page {
    if (!isS3)
      return {
        rows: [
          {
            eventId: "demo",
            timestamp: Date.now(),
            logStreamName: "demo-stream",
            message:
              '{"level":"info","message":"Request completed","status":200}',
          },
        ],
        nextToken: null,
      };
    return {
      rows: prefix
        ? [
            {
              kind: "file",
              Key: `${prefix}example.json`,
              Size: 128,
              LastModified: new Date().toISOString(),
              StorageClass: "STANDARD",
            },
          ]
        : [
            { kind: "folder", Prefix: "assets/" },
            {
              kind: "file",
              Key: "index.html",
              Size: 2048,
              LastModified: new Date().toISOString(),
              StorageClass: "STANDARD",
            },
          ],
      nextToken: null,
    };
  }
  async function load(more = false) {
    const id = ++generation;
    if (!more) {
      rows = [];
      next = null;
      detail = null;
      shown = false;
      end = Date.now();
      start = end - hours * 3600000;
      appliedPattern = pattern;
    }
    const token = more ? next : null;
    busy = true;
    error = "";
    draw();
    try {
      const page = ctx.demo
        ? demoPage()
        : await invoke<Page>("browse_resources", {
            query: {
              profile: ctx.profile,
              region: ctx.region,
              kind: isS3 ? "objects" : "events",
              resource: ctx.resource,
              prefix,
              nextToken: token,
              startTime: start,
              endTime: end,
              pattern: appliedPattern,
            },
          });
      if (!root.isConnected || id !== generation) return;
      rows = mergeRows(more ? rows : [], page.rows, (row) =>
        isS3
          ? String(row.kind) + ":" + String(row.Prefix ?? row.Key)
          : String(row.eventId ?? JSON.stringify(row)),
      );
      next = page.nextToken && page.nextToken !== token ? page.nextToken : null;
      shown = true;
    } catch (e) {
      if (id === generation) error = String(e);
    } finally {
      if (root.isConnected && id === generation) {
        busy = false;
        draw();
      }
    }
  }
  function navigate(path: string) {
    prefix = path;
    void load();
  }
  function draw() {
    const segments = prefix.endsWith("/")
      ? prefix.slice(0, -1).split("/")
      : prefix.split("/");
    const crumbs = !prefix
      ? ""
      : segments
          .map(
            (segment, i) =>
              `<button class="quiet" data-prefix="${escape(segments.slice(0, i + 1).join("/") + (i < segments.length - 1 || prefix.endsWith("/") ? "/" : ""))}">${escape(segment || t("emptyPath"))}/</button>`,
          )
          .join("");
    const ranges: [number, Message][] = [
      [1, "hour1"],
      [6, "hour6"],
      [24, "day1"],
      [168, "day7"],
      [720, "day30"],
    ];
    root.innerHTML = `
      <p class="explorer-context">${escape(ctx.profile)} · ${escape(ctx.region)} · ${t(ctx.demo ? "demoData" : "readOnly")}</p>
      ${
        isS3
          ? `<div class="explorer-toolbar"><button class="quiet" data-prefix="">${t("root")}</button>${crumbs}</div>
        <form id="prefix-form"><label>${t("path")}<input id="prefix-input" aria-label="${t("path")}" value="${escape(prefix)}" placeholder="${t("s3PathHint")}"></label><button class="quiet" ${busy ? "disabled" : ""}>${t("go")}</button></form><p class="explorer-context">${t("objectNotice")}</p>`
          : `<form id="log-form"><label>${t("range")}<select id="hours" aria-label="${t("range")}">${ranges.map(([h, key]) => `<option value="${h}" ${hours === h ? "selected" : ""}>${t(key)}</option>`).join("")}</select></label><label class="grow">${t("pattern")}<input id="pattern" aria-label="${t("pattern")}" value="${escape(pattern)}" placeholder="${escape(t("patternHint"))}"></label><button class="quiet" ${busy ? "disabled" : ""}>${t("apply")}</button></form>
        <p class="explorer-context">${t("chronological")} · ${new Date(start).toLocaleString(locale())} ~ ${new Date(end).toLocaleString(locale())}</p>`
      }
      ${error ? `<div class="error" role="alert"><strong>${t("error")}</strong><pre>${escape(error)}</pre><button id="explorer-retry" class="quiet">${t("retry")}</button></div>` : ""}
      ${
        isS3
          ? `<div class="object-list">${rows.map((row, i) => `<button class="object-row" data-object="${i}"><span class="object-icon">${row.kind === "folder" ? "▱" : "▤"}</span><span class="grow"><strong>${escape((row.Prefix ?? row.Key).slice(prefix.length) || row.Key)}</strong><small>${row.kind === "folder" ? t("folder") : `${size(row.Size || 0)} · ${escape(row.StorageClass || "STANDARD")}`}</small></span><span>${row.kind === "folder" ? "›" : escape(new Date(row.LastModified).toLocaleDateString(locale()))}</span></button>`).join("")}</div>`
          : `<div class="log-events">${rows.map((row) => `<article class="log-event"><header><time>${escape(new Date(row.timestamp).toLocaleString(locale()))}</time><span>${escape(row.logStreamName)}</span></header><pre>${escape(row.message)}</pre></article>`).join("")}</div>`
      }
      ${busy ? `<p role="status">${t(isS3 ? "objectsLoading" : "logsLoading")}</p>` : shown && !rows.length ? `<div class="explorer-empty">${t(isS3 ? "noObjects" : "noEvents")}</div>` : ""}
      <div class="explorer-toolbar"><span>${rows.length} ${t("loaded")}</span>${next ? `<button id="explorer-more" class="quiet" ${busy ? "disabled" : ""}>${t("next")}</button>` : ""}<button id="explorer-refresh" class="quiet" ${busy ? "disabled" : ""}>${t("refresh")}</button></div>
      ${detail ? `<section class="object-detail"><h3>${t("fileInfo")}</h3><p>S3 URI</p><pre>${escape(`s3://${ctx.resource}/${detail.Key}`)}</pre><pre>${escape(JSON.stringify(detail, null, 2))}</pre></section>` : ""}`;
    root
      .querySelectorAll<HTMLButtonElement>("[data-prefix]")
      .forEach((b) => (b.onclick = () => navigate(b.dataset.prefix!)));
    root.querySelectorAll<HTMLButtonElement>("[data-object]").forEach(
      (b) =>
        (b.onclick = () => {
          const row = rows[Number(b.dataset.object)];
          if (row.kind === "folder") navigate(row.Prefix);
          else {
            detail = row;
            draw();
            root
              .querySelector(".object-detail")
              ?.scrollIntoView({ block: "nearest" });
          }
        }),
    );
    const prefixForm = root.querySelector<HTMLFormElement>("#prefix-form");
    if (prefixForm)
      prefixForm.onsubmit = (e) => {
        e.preventDefault();
        navigate(root.querySelector<HTMLInputElement>("#prefix-input")!.value);
      };
    const logForm = root.querySelector<HTMLFormElement>("#log-form");
    if (logForm)
      logForm.onsubmit = (e) => {
        e.preventDefault();
        hours = Number(root.querySelector<HTMLSelectElement>("#hours")!.value);
        pattern = root.querySelector<HTMLInputElement>("#pattern")!.value;
        void load();
      };
    root
      .querySelector("#explorer-more")
      ?.addEventListener("click", () => void load(true));
    root
      .querySelector("#explorer-refresh")
      ?.addEventListener("click", () => void load());
    root
      .querySelector("#explorer-retry")
      ?.addEventListener("click", () => void load(Boolean(next)));
  }
  void load();
}
