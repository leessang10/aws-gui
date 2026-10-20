import { invoke, isTauri } from "@tauri-apps/api/core";
import "./style.css";
import { mountExplorer } from "./explorer";
import {
  t,
  locale,
  language,
  setLanguage,
  type Language,
  type Message,
} from "./i18n";
import { icon } from "./icons";

type Service = "ec2" | "rds" | "s3" | "logs";
type Resource = Record<string, any>;
type Page = { rows: Resource[]; nextToken: string | null };
type Cached = Page & { updated: number };
const services: Record<Service, true> = {
  ec2: true,
  rds: true,
  s3: true,
  logs: true,
};
const demo: Record<Service, Resource[]> = {
  ec2: [
    {
      InstanceId: "i-demo001",
      Tags: [{ Key: "Name", Value: "woojoo-api-production" }],
      State: { Name: "running" },
      InstanceType: "t3.medium",
      Placement: { AvailabilityZone: "ap-northeast-2a" },
      PrivateIpAddress: "10.0.1.24",
      PublicIpAddress: "203.0.113.24",
    },
    {
      InstanceId: "i-demo002",
      Tags: [{ Key: "Name", Value: "background-worker" }],
      State: { Name: "running" },
      InstanceType: "t3.small",
      Placement: { AvailabilityZone: "ap-northeast-2c" },
      PrivateIpAddress: "10.0.3.12",
    },
    {
      InstanceId: "i-demo003",
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
      Endpoint: { Address: "demo.example.invalid", Port: 5432 },
    },
  ],
  s3: [
    { Name: "woojoo-assets-demo", CreationDate: "2026-09-12T09:00:00Z" },
    { Name: "woojoo-backups-demo", CreationDate: "2026-09-18T09:00:00Z" },
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
const app = document.querySelector<HTMLDivElement>("#app")!;
const cache = new Map<string, Cached>();
let service: Service = "ec2";
let profile = "";
let profiles: string[] = [];
let region = localStorage.getItem("orbit.region") || "ap-northeast-2";
let rows: Resource[] = [];
let nextToken: string | null = null;
let selected: Resource | null = null;
let search = "";
let statusFilter = "all";
let busy = false;
let error = "";
let updated = 0;
let requestId = 0;
let booting = true;
let demoMode = !isTauri();
let cliVersion = "";
let collapsed = localStorage.getItem("orbit.sidebarCollapsed") === "true";
let account = "";
let accountBusy = false;
let identityId = 0;
const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const key = () => `${demoMode}|${profile}|${region}|${service}`;
const date = (v: unknown) =>
  v ? new Date(v as string | number).toLocaleDateString(locale()) : "—";
function cells(row: Resource): string[] {
  if (service === "ec2")
    return [
      row.Tags?.find((t: Resource) => t.Key === "Name")?.Value ||
        row.InstanceId,
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
function resetView() {
  requestId++;
  busy = false;
  selected = null;
  error = "";
  search = "";
  statusFilter = "all";
  const saved = cache.get(key());
  rows = saved?.rows || [];
  nextToken = saved?.nextToken || null;
  updated = saved?.updated || 0;
  render();
  if (profile && (!saved || Date.now() - saved.updated > 30000)) void refresh();
}
async function refresh(more = false) {
  if (!profile || busy) return;
  const id = ++requestId;
  const cacheKey = key();
  busy = true;
  error = "";
  render();
  try {
    const page = demoMode
      ? { rows: demo[service], nextToken: null }
      : await invoke<Page>("list_resources", {
          query: {
            service,
            profile,
            region,
            nextToken: more ? nextToken : null,
          },
        });
    if (id !== requestId) return;
    rows = more ? [...rows, ...page.rows] : page.rows;
    nextToken = page.nextToken;
    updated = Date.now();
    selected = null;
    cache.set(cacheKey, { rows, nextToken, updated });
  } catch (e) {
    if (id === requestId) error = String(e);
  } finally {
    if (id === requestId) {
      busy = false;
      render();
    }
  }
}
async function init() {
  booting = true;
  error = "";
  render();
  if (demoMode) {
    profiles = ["demo-workspace"];
    profile = profiles[0];
    cliVersion = "미리보기 · 샘플 데이터";
  } else {
    try {
      const result = await invoke<{ profiles: string[]; version: string }>(
        "bootstrap",
      );
      profiles = result.profiles;
      cliVersion = result.version;
      const saved = localStorage.getItem("orbit.profile");
      profile = profiles.includes(saved || "") ? saved! : profiles[0] || "";
    } catch (e) {
      error = String(e);
    }
  }
  booting = false;
  render();
  // Real account queries start only when the user presses Refresh or changes context.
  if (demoMode) void refresh();
  else void loadIdentity();
}
function render() {
  const columnKeys: Record<Service, Message[]> = {
    ec2: ["instance", "state", "type", "zone", "ip"],
    rds: ["database", "state", "engine", "dbClass", "zone"],
    s3: ["bucket", "state", "created", "scope", "region"],
    logs: ["group", "state", "retention", "storage", "created"],
  };
  const descriptions: Record<Service, Message> = {
    ec2: "ec2Desc",
    rds: "rdsDesc",
    s3: "s3Desc",
    logs: "logsDesc",
  };
  const visible = rows
    .map((row, index) => ({ row, index, cols: cells(row) }))
    .filter(
      ({ row, cols }) =>
        [...cols, row.InstanceId || ""]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (statusFilter === "all" || cols[1] === statusFilter),
    );
  const states = [...new Set(rows.map((row) => cells(row)[1]))];
  app.classList.toggle("collapsed", collapsed);
  app.innerHTML = `
    <aside class="sidebar" ${selected ? "inert" : ""}>
      <div class="brand-row"><span class="brand">Orbit<span>AWS</span></span><button id="collapse" class="icon-button" aria-label="${t(collapsed ? "expand" : "collapse")}" title="${t(collapsed ? "expand" : "collapse")} (Ctrl+B)" aria-expanded="${!collapsed}">${icon("panel")}</button></div>
      <div class="nav-label">${t("resources")}</div>
      <nav>${(Object.keys(services) as Service[]).map((s) => `<button class="nav-item ${service === s ? "active" : ""}" data-service="${s}" title="${t(s)}" aria-label="${t(s)}" ${service === s ? 'aria-current="page"' : ""}>${icon(s)}<span>${t(s)}</span></button>`).join("")}</nav>
      <div class="sidebar-bottom"><span>${t("cli")}</span><small>v0.1.0</small></div>
    </aside>
    <main ${selected ? "inert" : ""}>
      <header class="topbar">
        <div class="connection-controls"><label>${t("profile")}<select id="profile" ${demoMode || booting ? "disabled" : ""}>${profiles.length ? profiles.map((p) => `<option ${p === profile ? "selected" : ""}>${esc(p)}</option>`).join("") : `<option>${t("noProfiles")}</option>`}</select></label>
        <label>${t("region")}<input id="region" aria-label="${t("region")}" value="${esc(region)}" list="regions" ${demoMode ? "disabled" : ""}><datalist id="regions">${["ap-northeast-2", "me-south-1", "ap-northeast-1", "us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"].map((r) => `<option value="${r}">`).join("")}</datalist></label></div>
        <div class="top-actions"><span class="account-id" title="${t("sameAccount")}">${demoMode ? t("demoData") : `${t("account")}: ${esc(account || t(accountBusy ? "identityLoading" : "identityUnavailable"))}`}</span><select id="language" aria-label="${t("language")}"><option value="ko" ${language === "ko" ? "selected" : ""}>한국어</option><option value="en" ${language === "en" ? "selected" : ""}>English</option></select></div>
      </header>
      <section class="content">
        ${demoMode ? `<div class="demo-banner">${t("preview")}</div>` : ""}
        <div class="page-heading"><div><h1>${t(service)}</h1><p>${t(descriptions[service])}</p></div><button id="refresh" class="primary" ${busy || !profile ? "disabled" : ""}>${icon("refresh")} ${t(busy ? "loading" : "refresh")}</button></div>
        ${error ? `<div class="error" role="alert"><strong>${t("error")}</strong><pre>${esc(error)}</pre><p>${t("ssoHint")}</p><button id="retry" class="quiet">${t("reconnect")}</button></div>` : ""}
        ${!profile && !booting && !error ? `<div class="error">${t("profileHelp")}<button id="retry" class="quiet">${t("reconnect")}</button></div>` : ""}
        <section class="resource-panel">
          <div class="panel-header"><div class="search">${icon("search")}<input id="search" aria-label="${t("search")}" placeholder="${t("search")}" value="${esc(search)}"><kbd>/</kbd></div><select id="status" aria-label="${t("state")}"><option value="all">${t("allStates")}</option>${states.map((s) => `<option value="${esc(s)}" ${statusFilter === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><span class="resource-count">${updated ? rows.length : "—"} ${t("resources")}</span></div>
          <div class="table-scroll"><table><thead><tr>${columnKeys[service].map((c) => `<th scope="col">${t(c)}</th>`).join("")}<th scope="col"><span class="sr-only">${t("detail")}</span></th></tr></thead><tbody>${visible
            .map(
              ({ index, cols }) =>
                `<tr><td><button class="resource-link" data-row="${index}"><span>${esc(cols[0])}${service === "ec2" ? `<small>${esc(rows[index].InstanceId)}</small>` : ""}</span></button></td><td><span class="badge ${["running", "available"].includes(cols[1]) ? "healthy" : ""}">${esc(cols[1])}</span></td>${cols
                  .slice(2)
                  .map((c) => `<td class="mono">${esc(c)}</td>`)
                  .join(
                    "",
                  )}<td><button class="row-open icon-button" data-row="${index}" aria-label="${esc(cols[0])} ${t("detail")}">${icon("arrow")}</button></td></tr>`,
            )
            .join("")}</tbody></table></div>
          ${!visible.length ? `<div class="empty" role="status"><h2>${t(busy || booting ? "loading" : rows.length ? "noResults" : updated ? "empty" : "ready")}</h2><p>${t(rows.length ? "trySearch" : updated ? "checkContext" : "readyHelp")}</p></div>` : ""}
          <footer class="table-footer"><span>${t("showing")} ${visible.length} / ${rows.length}${error && updated ? ` · ${t("previous")}` : ""}</span>${nextToken ? `<button id="more" class="quiet" ${busy ? "disabled" : ""}>${t("next")}</button>` : `<span>${t("detailsHint")}</span>`}</footer>
        </section>
        <div class="list-status"><span>${t("readOnly")} · ${service === "s3" ? t("accountWide") : esc(region)}</span><span>${updated ? `${t("updated")} ${new Date(updated).toLocaleTimeString(locale(), { hour12: false })}` : t("notLoaded")}</span></div>
      </section>
      <footer class="statusbar"><span title="${esc(cliVersion)}">${esc(cliVersion ? (demoMode ? t("demoData") : cliVersion.split(" ")[0]) : t("cliConnecting"))}</span>${isTauri() ? `<button id="demo" class="text-button">${t(demoMode ? "live" : "demo")}</button>` : ""}</footer>
    </main>
    ${selected ? `<div class="drawer-backdrop"><aside class="drawer ${service === "s3" || service === "logs" ? "explorer-drawer" : ""}" role="dialog" aria-modal="true" aria-label="${t("detail")}"><div class="drawer-heading"><span>${t(service === "s3" ? "s3Files" : service === "logs" ? "logEvents" : "detail")}</span><button id="close" class="icon-button" aria-label="${t("close")}">${icon("close")}</button></div><h2>${esc(cells(selected)[0])}</h2>${service === "s3" || service === "logs" ? '<div id="detail-content"></div>' : `<p>${t("raw")}</p><pre>${esc(JSON.stringify(selected, null, 2))}</pre>`}</aside></div>` : ""}`;
  if (selected && (service === "s3" || service === "logs")) {
    mountExplorer(document.querySelector<HTMLElement>("#detail-content")!, {
      profile,
      region,
      demo: demoMode,
      service,
      resource: service === "s3" ? selected.Name : selected.logGroupName,
    });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-service]").forEach(
    (el) =>
      (el.onclick = () => {
        service = el.dataset.service as Service;
        resetView();
      }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-row]").forEach(
    (el) =>
      (el.onclick = () => {
        selected = rows[Number(el.dataset.row)];
        render();
        document.querySelector<HTMLButtonElement>("#close")?.focus();
      }),
  );
  bind("collapse", toggleSidebar);
  bind("refresh", () => void refresh());
  bind("more", () => void refresh(true));
  bind("retry", () => void init());
  bind("close", () => {
    selected = null;
    render();
  });
  bind("demo", () => {
    requestId++;
    busy = false;
    cache.clear();
    rows = [];
    updated = 0;
    nextToken = null;
    selected = null;
    search = "";
    statusFilter = "all";
    demoMode = !demoMode;
    void init();
  });
  document.querySelector<HTMLSelectElement>("#language")!.onchange = (e) => {
    setLanguage((e.target as HTMLSelectElement).value as Language);
    statusFilter = "all";
    render();
  };
  document.querySelector<HTMLSelectElement>("#profile")!.onchange = (e) => {
    profile = (e.target as HTMLSelectElement).value;
    localStorage.setItem("orbit.profile", profile);
    resetView();
    void loadIdentity();
  };
  document.querySelector<HTMLInputElement>("#region")!.onchange = (e) => {
    region = (e.target as HTMLInputElement).value.trim();
    localStorage.setItem("orbit.region", region);
    resetView();
    void loadIdentity();
  };
  document.querySelector<HTMLSelectElement>("#status")!.onchange = (e) => {
    statusFilter = (e.target as HTMLSelectElement).value;
    render();
  };
  document.querySelector<HTMLInputElement>("#search")!.oninput = (e) => {
    const input = e.target as HTMLInputElement;
    const position = input.selectionStart;
    search = input.value;
    render();
    const next = document.querySelector<HTMLInputElement>("#search")!;
    next.focus();
    next.setSelectionRange(position, position);
  };
}
function toggleSidebar() {
  collapsed = !collapsed;
  localStorage.setItem("orbit.sidebarCollapsed", String(collapsed));
  render();
  document.querySelector<HTMLButtonElement>("#collapse")?.focus();
}
async function loadIdentity() {
  const id = ++identityId;
  account = "";
  accountBusy = true;
  if (demoMode || !profile) {
    accountBusy = false;
    return;
  }
  if (!selected) render();
  try {
    const result = await invoke<{ Account: string }>("account_identity", {
      query: { service: "ec2", profile, region, nextToken: null },
    });
    if (id === identityId) account = result.Account;
  } catch {
    /* Listing permissions can work even if STS is unavailable. */
  } finally {
    if (id === identityId) {
      accountBusy = false;
      if (!selected) render();
    }
  }
}
function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener("click", fn);
}
document.addEventListener("keydown", (e) => {
  if (!selected && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
    e.preventDefault();
    toggleSidebar();
  }
  if (e.key === "Tab" && selected) {
    const focusable = [
      ...document.querySelectorAll<HTMLElement>(
        ".drawer button:not(:disabled), .drawer input, .drawer select",
      ),
    ];
    const first = focusable[0],
      last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  if (e.key === "Escape" && selected) {
    selected = null;
    render();
  }
  if (
    !selected &&
    e.key === "/" &&
    !["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
  ) {
    e.preventDefault();
    document.querySelector<HTMLInputElement>("#search")?.focus();
  }
});
void init();
