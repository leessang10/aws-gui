import { invoke, isTauri } from "@tauri-apps/api/core";
import "./style.css";
import { mountExplorer } from "./explorer";
import { t, locale, type Message } from "./i18n";
import { mergeRows } from "./pagination";
import { icon } from "./icons";
import { mountWorkspace, text, type WorkspaceRoute } from "./workspace";
import { bindContextMenu, closeContextMenu, copyAction } from "./context-menu";
import {
  savePreferences,
  readPreferences,
  rememberService,
} from "./workspace-state";

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
const app = document.querySelector<HTMLDivElement>("#app")!;
const cache = new Map<string, Cached>();
let service: Service = "ec2";
let route: WorkspaceRoute = { kind: "resources" };
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
const demoMode = !isTauri();
let cliVersion = "";
let collapsed = localStorage.getItem("orbit.sidebarCollapsed") === "true";
let account = "";
let accountBusy = false;
let identityId = 0;
let bootstrapId = 0;
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
  if (route.kind === "detail") route = { kind: "resources" };
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
  if (
    route.kind === "resources" &&
    profile &&
    (!saved || Date.now() - saved.updated > 30000)
  )
    void refresh();
}
async function refresh(more = false) {
  if (!profile || busy || booting) return;
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
    rows = mergeRows(more ? rows : [], page.rows, (row) =>
      String(
        row.InstanceId ??
          row.DBInstanceIdentifier ??
          row.Name ??
          row.logGroupName ??
          JSON.stringify(row),
      ),
    );
    nextToken = more && page.nextToken === nextToken ? null : page.nextToken;
    updated = Date.now();
    selected = null;
    cache.delete(cacheKey);
    cache.set(cacheKey, { rows, nextToken, updated });
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
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
  const id = ++bootstrapId;
  requestId++;
  identityId++;
  busy = false;
  account = "";
  accountBusy = false;
  profile = "";
  profiles = [];
  cliVersion = "";
  rows = [];
  nextToken = null;
  updated = 0;
  selected = null;
  cache.clear();
  booting = true;
  error = "";
  render();
  if (demoMode) {
    profiles = ["workspace"];
    profile = profiles[0];
    cliVersion = "";
  } else {
    try {
      const result = await invoke<{ profiles: string[]; version: string }>(
        "bootstrap",
      );
      if (id !== bootstrapId) return;
      profiles = result.profiles;
      cliVersion = result.version;
      const saved = localStorage.getItem("orbit.profile");
      profile = profiles.includes(saved || "") ? saved! : profiles[0] || "";
    } catch (e) {
      if (id !== bootstrapId) return;
      error = String(e);
    }
  }
  if (id !== bootstrapId) return;
  booting = false;
  render();
  // Real account queries start only when the user presses Refresh or changes context.
  if (demoMode) void refresh();
  else void loadIdentity();
}
function render() {
  closeContextMenu();
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
  document.body.classList.toggle(
    "compact",
    readPreferences().density === "compact",
  );
  app.innerHTML = `
    <aside class="sidebar" ${selected ? "inert" : ""}>
      <div class="brand-row"><span class="brand">Orbit<span>AWS</span></span><button id="collapse" class="icon-button" aria-label="${t(collapsed ? "expand" : "collapse")}" title="${t(collapsed ? "expand" : "collapse")} (Ctrl+B)" aria-expanded="${!collapsed}">${icon("panel")}</button></div>
      <div class="nav-label">${t("resources")}</div>
      <nav>${(Object.keys(services) as Service[]).map((s) => `<button class="nav-item ${service === s ? "active" : ""}" data-service="${s}" title="${t(s)}" aria-label="${t(s)}" ${service === s ? 'aria-current="page"' : ""}>${icon(s)}<span>${t(s)}</span></button>`).join("")}</nav>
      <div class="sidebar-connection"><button id="expand-connection" class="icon-button" aria-label="${t("profile")} / ${t("region")}" title="${esc(profile)} · ${esc(region)}">${icon("panel")}</button><div class="connection-controls"><label>${t("profile")}<select id="profile" ${demoMode || booting ? "disabled" : ""}>${profiles.length ? profiles.map((p) => `<option ${p === profile ? "selected" : ""}>${esc(p)}</option>`).join("") : `<option>${t("noProfiles")}</option>`}</select></label>
        <label>${t("region")}<input id="region" aria-label="${t("region")}" value="${esc(region)}" list="regions" ${demoMode ? "disabled" : ""}><datalist id="regions">${["ap-northeast-2", "me-south-1", "ap-northeast-1", "us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"].map((r) => `<option value="${r}">`).join("")}</datalist></label></div><span class="account-id" title="${t("sameAccount")}">${demoMode ? "" : `${t("account")}: ${esc(account || t(accountBusy ? "identityLoading" : "identityUnavailable"))}`}</span></div><div class="sidebar-bottom"><span>${t("cli")}</span><small>v0.1.0</small></div>
    </aside>
    <main ${selected ? "inert" : ""}>

      <section class="content">

        <div class="page-heading"><div><h1>${t(service)}</h1><p>${t(descriptions[service])}</p></div><button id="open-service-api" class="quiet">${text("API 작업대", "API workbench")}</button><button id="refresh" class="primary" ${busy || booting || !profile ? "disabled" : ""}>${icon("refresh")} ${t(busy ? "loading" : "refresh")}</button></div>
        ${error ? `<div class="error" role="alert"><strong>${t("error")}</strong><pre tabindex="0">${esc(error)}</pre><p>${t("ssoHint")}</p><button id="retry" class="quiet">${t("reconnect")}</button></div>` : ""}
        ${!profile && !booting && !error ? `<div class="error">${t("profileHelp")}<button id="retry" class="quiet">${t("reconnect")}</button></div>` : ""}
        <section class="resource-panel">
          <div class="panel-header"><div class="search">${icon("search")}<input id="search" aria-label="${t("search")}" placeholder="${t("search")}" value="${esc(search)}"><kbd>/</kbd></div><select id="status" aria-label="${t("state")}"><option value="all">${t("allStates")}</option>${states.map((s) => `<option value="${esc(s)}" ${statusFilter === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><span class="resource-count">${updated ? rows.length : "—"} ${t("resources")}</span></div>
          <div class="table-scroll"><table><thead><tr>${columnKeys[service].map((c) => `<th scope="col">${t(c)}</th>`).join("")}<th scope="col"><span class="sr-only">${t("detail")}</span></th></tr></thead><tbody>${visible
            .map(
              ({ index, cols }) =>
                `<tr data-context-row="${index}"><td><button class="resource-link" data-row="${index}"><span>${esc(cols[0])}${service === "ec2" ? `<small>${esc(rows[index].InstanceId)}</small>` : ""}</span></button></td><td><span class="badge ${["running", "available"].includes(cols[1]) ? "healthy" : ""}">${esc(cols[1])}</span></td>${cols
                  .slice(2)
                  .map((c) => `<td class="mono">${esc(c)}</td>`)
                  .join(
                    "",
                  )}<td><button class="quiet" data-manage="${index}" aria-label="${esc(cols[0])} ${text("작업", "Actions")}">${text("작업", "Actions")}</button><button class="row-open icon-button" data-row="${index}" aria-label="${esc(cols[0])} ${t("detail")}">${icon("arrow")}</button></td></tr>`,
            )
            .join("")}</tbody></table></div>
          ${!visible.length ? `<div class="empty" role="status"><h2>${t(busy || booting ? "loading" : rows.length ? "noResults" : updated ? "empty" : "ready")}</h2><p>${t(rows.length ? "trySearch" : updated ? "checkContext" : "readyHelp")}</p></div>` : ""}
          <footer class="table-footer"><span>${t("showing")} ${visible.length} / ${rows.length}${error && updated ? ` · ${t("previous")}` : ""}</span>${nextToken ? `<button id="more" class="quiet" ${busy ? "disabled" : ""}>${t("next")}</button>` : `<span>${t("detailsHint")}</span>`}</footer>
        </section>
        <div class="list-status"><span>${t("readOnly")} · ${service === "s3" ? t("accountWide") : esc(region)}</span><span>${updated ? `${t("updated")} ${new Date(updated).toLocaleTimeString(locale(), { hour12: false })}` : t("notLoaded")}</span></div>
      </section>
      <footer class="statusbar"><span title="${esc(cliVersion)}">${demoMode ? "" : esc(cliVersion ? cliVersion.split(" ")[0] : t("cliConnecting"))}</span></footer>
    </main>
    ${selected ? `<div class="drawer-backdrop"><aside class="drawer ${service === "s3" || service === "logs" ? "explorer-drawer" : ""}" role="dialog" aria-modal="true" aria-label="${t("detail")}"><div class="drawer-heading"><span>${t(service === "s3" ? "s3Files" : service === "logs" ? "logEvents" : "detail")}</span><button id="close" class="icon-button" aria-label="${t("close")}">${icon("close")}</button></div><h2>${esc(cells(selected)[0])}</h2><button id="full-detail" class="quiet">${text("리소스 작업 · 상세", "Actions · Details")}</button>${service === "s3" || service === "logs" ? '<div id="detail-content"></div>' : `<p>${t("raw")}</p><pre tabindex="0">${esc(JSON.stringify(selected, null, 2))}</pre>`}</aside></div>` : ""}`;
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
  document.querySelectorAll<HTMLElement>("[data-context-row]").forEach((el) => {
    const row = rows[Number(el.dataset.contextRow)];
    const id =
      row.InstanceId ??
      row.DBInstanceIdentifier ??
      row.Name ??
      row.logGroupName;
    bindContextMenu(el, () => [
      {
        label: text("빠른 보기", "Quick view"),
        run: () => {
          selected = row;
          render();
          document.querySelector<HTMLButtonElement>("#close")?.focus();
        },
      },
      {
        label: text("리소스 작업 · 상세", "Actions · Details"),
        run: () =>
          navigate({
            kind: "detail",
            service: service === "s3" ? "s3api" : service,
            resource: row,
          }),
      },
      copyAction(text("리소스 ID / 이름 복사", "Copy resource ID / name"), id),
      copyAction(text("JSON 복사", "Copy JSON"), JSON.stringify(row, null, 2)),
      {
        label: text("목록 새로고침", "Refresh resources"),
        disabled: busy,
        run: () => refresh(),
      },
    ]);
  });
  bindContextMenu(document.querySelector<HTMLElement>(".drawer"), () => [
    copyAction(
      text("리소스 JSON 복사", "Copy resource JSON"),
      JSON.stringify(selected, null, 2),
    ),
    {
      label: text("리소스 작업 · 상세", "Actions · Details"),
      run: () => document.getElementById("full-detail")?.click(),
    },
  ]);
  bindContextMenu(app, () => [
    {
      label: text("전체 서비스", "All services"),
      run: () => navigate({ kind: "catalog" }),
    },
    {
      label: text("설정", "Settings"),
      run: () => navigate({ kind: "settings" }),
    },
    {
      label: text(
        collapsed ? "사이드바 펼치기" : "사이드바 접기",
        collapsed ? "Expand sidebar" : "Collapse sidebar",
      ),
      run: toggleSidebar,
    },
  ]);
  document
    .querySelectorAll<HTMLButtonElement>("[data-manage]")
    .forEach((button) => {
      button.onclick = () =>
        navigate({
          kind: "detail",
          service: service === "s3" ? "s3api" : service,
          resource: rows[Number(button.dataset.manage)],
        });
    });
  bind("full-detail", () =>
    navigate({
      kind: "detail",
      service: service === "s3" ? "s3api" : service,
      resource: selected!,
    }),
  );
  bind("collapse", toggleSidebar);
  bind("open-service-api", () =>
    navigate({ kind: "api", service: service === "s3" ? "s3api" : service }),
  );
  bind("refresh", () => void refresh());
  bind("more", () => void refresh(true));
  bind("retry", () => void init());
  bind("close", () => {
    selected = null;
    render();
  });
  bind("expand-connection", () => {
    toggleSidebar();
    document.querySelector<HTMLSelectElement>("#profile")?.focus();
  });
  document.querySelector<HTMLSelectElement>("#profile")!.onchange = (e) => {
    profile = (e.target as HTMLSelectElement).value;
    localStorage.setItem("orbit.profile", profile);
    account = "";
    cache.clear();
    resetView();
    void loadIdentity();
  };
  document.querySelector<HTMLInputElement>("#region")!.onchange = (e) => {
    region = (e.target as HTMLInputElement).value.trim();
    localStorage.setItem("orbit.region", region);
    account = "";
    cache.clear();
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
  updateNavigation();
  if (route.kind !== "resources")
    mountWorkspace(document.querySelector<HTMLElement>(".content")!, {
      profile,
      region,
      demo: demoMode,
      route,
      navigate,
      settingsChanged: (value) => {
        if (value) {
          region = value;
          localStorage.setItem("orbit.region", region);
          account = "";
          identityId++;
        }
        cache.clear();
        rows = [];
        updated = 0;
        nextToken = null;
        render();
        if (value) void loadIdentity();
      },
      clearCache: () => {
        cache.clear();
        rows = [];
        updated = 0;
        nextToken = null;
      },
    });
}
function navigate(next: WorkspaceRoute) {
  window.scrollTo(0, 0);
  requestId++;
  busy = false;
  selected = null;
  route = next;
  if (next.service) rememberService(next.service);
  if (next.kind === "resources") {
    service = (
      next.service === "s3api" ? "s3" : next.service || service
    ) as Service;
    resetView();
  } else render();
}
function updateNavigation() {
  const p = readPreferences();
  const name = (id: string) => (id === "s3api" ? "S3" : id.toUpperCase());
  const item = (id: string) =>
    '<button class="nav-item ' +
    (route.service === id ||
    (route.kind === "resources" &&
      (service === "s3" ? "s3api" : service) === id)
      ? "active"
      : "") +
    '" data-nav-service="' +
    esc(id) +
    '" title="' +
    esc(name(id)) +
    '">' +
    icon(id === "s3api" ? "s3" : id) +
    "<span>" +
    esc(name(id)) +
    "</span></button>";
  document.querySelector(".sidebar .nav-label")!.textContent = text(
    "작업 공간",
    "Workspace",
  );
  const nav = document.querySelector(".sidebar nav")!;
  nav.innerHTML =
    '<button id="nav-catalog" class="nav-item ' +
    (route.kind === "catalog" ? "active" : "") +
    '" title="' +
    text("전체 서비스", "All services") +
    '">' +
    icon("search") +
    "<span>" +
    text("전체 서비스", "All services") +
    '</span></button><div class="nav-label">' +
    text("즐겨찾기", "Favorites") +
    "</div>" +
    p.favorites.map(item).join("") +
    '<div class="nav-label">' +
    text("최근 사용", "Recent") +
    "</div>" +
    p.recent
      .filter((id) => !p.favorites.includes(id))
      .map(item)
      .join("") +
    '<button id="nav-settings" class="nav-item ' +
    (route.kind === "settings" ? "active" : "") +
    '" title="' +
    text("설정", "Settings") +
    '">' +
    icon("settings") +
    "<span>" +
    text("설정", "Settings") +
    "</span></button>";
  nav.querySelectorAll<HTMLButtonElement>("[data-nav-service]").forEach(
    (b) =>
      (b.onclick = () =>
        navigate({
          kind: ["ec2", "rds", "s3api", "logs"].includes(b.dataset.navService!)
            ? "resources"
            : "api",
          service: b.dataset.navService,
        })),
  );
  nav.querySelectorAll<HTMLButtonElement>("[data-nav-service]").forEach((b) =>
    bindContextMenu(b, () => {
      const id = b.dataset.navService!;
      const prefs = readPreferences();
      const pinned = prefs.favorites.includes(id);
      return [
        { label: text("서비스 열기", "Open service"), run: () => b.click() },
        {
          label: text("API 작업대", "API workbench"),
          run: () => navigate({ kind: "api", service: id }),
        },
        {
          label: text(
            pinned ? "즐겨찾기에서 제거" : "즐겨찾기에 추가",
            pinned ? "Remove favorite" : "Add favorite",
          ),
          disabled: !pinned && prefs.favorites.length >= 8,
          run: () => {
            const p = readPreferences();
            p.favorites = pinned
              ? p.favorites.filter((s) => s !== id)
              : [...p.favorites, id].slice(0, 8);
            savePreferences(p);
            updateNavigation();
          },
        },
        copyAction(text("서비스 ID 복사", "Copy service ID"), id),
      ];
    }),
  );
  const mapButton = document.createElement("button");
  mapButton.id = "nav-topology";
  mapButton.className = `nav-item ${route.kind === "topology" ? "active" : ""}`;
  mapButton.title = text("인프라 구조도", "Infrastructure map");
  mapButton.innerHTML =
    icon("topology") +
    `<span>${text("인프라 구조도", "Infrastructure map")}</span>`;
  mapButton.onclick = () => navigate({ kind: "topology" });
  nav.querySelector("#nav-catalog")!.after(mapButton);
  bind("nav-catalog", () => navigate({ kind: "catalog" }));
  bind("nav-settings", () => navigate({ kind: "settings" }));
}
window.addEventListener("orbit:navigation", updateNavigation);
function toggleSidebar() {
  collapsed = !collapsed;
  localStorage.setItem("orbit.sidebarCollapsed", String(collapsed));
  app.classList.toggle("collapsed", collapsed);
  const toggle = document.querySelector<HTMLButtonElement>("#collapse");
  toggle?.setAttribute("aria-expanded", String(!collapsed));
  toggle?.setAttribute("aria-label", t(collapsed ? "expand" : "collapse"));
  if (toggle) toggle.title = t(collapsed ? "expand" : "collapse") + " (Ctrl+B)";
  toggle?.focus();
}
async function loadIdentity() {
  const id = ++identityId;
  account = "";
  accountBusy = true;
  if (demoMode || !profile) {
    accountBusy = false;
    return;
  }
  if (!selected && route.kind === "resources") render();
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
      if (!selected && route.kind === "resources") render();
      else {
        const label = document.querySelector(".account-id");
        if (label)
          label.textContent = `${t("account")}: ${account || t("identityUnavailable")}`;
      }
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
        '.drawer button:not(:disabled), .drawer input, .drawer select, .drawer [tabindex="0"]',
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
    document
      .querySelector<HTMLInputElement>(
        "#search, #catalog-search, #operation-search",
      )
      ?.focus();
  }
});
void init();
