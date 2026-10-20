import { useTheme } from "./theme";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Grid2X2,
  Network,
  Settings2,
  Orbit,
  PanelLeft,
  RefreshCw,
  Search,
  MoreHorizontal,
  ChevronRight,
  Plug,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField, SelectOption } from "@/components/ui/select-field";
import { Notifications } from "./notifications";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Heading,
  ServiceIcon,
  ContextActions,
  copyAction,
  ErrorPanel,
  JsonBlock,
  Loading,
  useAlive,
} from "./shared-ui";
import {
  Catalog,
  Settings,
  Details,
  ApiWorkbench,
  serviceRoute,
} from "./pages";
import Explorer from "./explorer-view";
import {
  text,
  cells,
  fixtures,
  resourceId,
  type Context,
  type Route,
  type Service,
  type Row,
  type Page,
  type Cached,
} from "./app-model";
import { t, locale, type Message } from "./i18n";
import { readPreferences, rememberService } from "./workspace-state";
import { mergeRows } from "./pagination";
const Topology = lazy(() => import("./topology"));
export function Resources({
  ctx,
  service,
  cache,
}: {
  ctx: Context;
  service: Service;
  cache: Map<string, Cached>;
}) {
  const cacheKey = `${ctx.demo}|${ctx.profile}|${ctx.region}|${service}`;
  const initial = cache.get(cacheKey);
  const [page, setPage] = useState<Cached>(
      initial ?? { rows: [], nextToken: null, updated: 0 },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState<Row>();
  const alive = useAlive(),
    pending = useRef(false),
    search = useRef<HTMLInputElement>(null);
  const apiService = service === "s3" ? "s3api" : service;
  async function refresh(more = false) {
    if (!ctx.profile || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const token = more ? page.nextToken : null;
    try {
      const data = ctx.demo
        ? { rows: fixtures[service], nextToken: null }
        : await invoke<Page>("list_resources", {
            query: {
              service,
              profile: ctx.profile,
              region: ctx.region,
              nextToken: token,
            },
          });
      if (!alive.current) return;
      const value = {
        rows: mergeRows(more ? page.rows : [], data.rows, resourceId),
        nextToken:
          data.nextToken && data.nextToken !== token ? data.nextToken : null,
        updated: Date.now(),
      };
      setPage(value);
      setSelected(undefined);
      cache.delete(cacheKey);
      cache.set(cacheKey, value);
      if (cache.size > 12) cache.delete(cache.keys().next().value!);
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!initial || Date.now() - initial.updated > 30000) void refresh();
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target as HTMLElement).closest(
          "input,textarea,[contenteditable=true]",
        )
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const headers: Record<Service, Message[]> = {
    ec2: ["instance", "state", "type", "zone", "ip"],
    rds: ["database", "state", "engine", "dbClass", "zone"],
    s3: ["bucket", "type", "created", "scope", "region"],
    logs: ["group", "type", "retention", "storage", "created"],
  };
  const filtered = page.rows.filter((r) => {
    const c = cells(service, r);
    return (
      c.join(" ").toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || c[1] === status)
    );
  });
  const detail = (row: Row) =>
    ctx.navigate({ kind: "detail", service: apiService, resource: row });
  return (
    <>
      <Heading title={t(service)} description={t(`${service}Desc` as Message)}>
        <Button
          variant="outline"
          onClick={() => ctx.navigate({ kind: "api", service: apiService })}
        >
          {text("API 실행", "API Runner")}
        </Button>
        <Button disabled={busy || !ctx.profile} onClick={() => refresh()}>
          <RefreshCw className={busy ? "animate-spin" : ""} />
          {t("refresh")}
        </Button>
      </Heading>
      <ErrorPanel error={error} />
      <section className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 p-4">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              ref={search}
              className="bg-background pl-9"
              aria-label={t("search")}
              placeholder={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {(service === "ec2" || service === "rds") && (
            <SelectField
              aria-label={t("state")}
              value={status}
              onValueChange={(value) => setStatus(value)}
            >
              <SelectOption value="all">{t("allStates")}</SelectOption>
              {[...new Set(page.rows.map((r) => cells(service, r)[1]))].map(
                (s) => (
                  <SelectOption key={s} value={s}>
                    {s}
                  </SelectOption>
                ),
              )}
            </SelectField>
          )}
          <span className="text-xs text-muted-foreground">
            {filtered.length} {t("resources")}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {headers[service].map((h, i) => (
                <TableHead key={i} className="h-11 px-5 text-xs">
                  {t(h)}
                </TableHead>
              ))}
              <TableHead className="w-12">
                <span className="sr-only">{text("작업", "Actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <ContextActions
                key={resourceId(row)}
                actions={[
                  {
                    label: text("빠른 상세", "Quick details"),
                    run: () => setSelected(row),
                  },
                  {
                    label: text("상세 및 작업", "Details & actions"),
                    run: () => detail(row),
                  },
                  copyAction(
                    text("리소스 ID 복사", "Copy resource ID"),
                    resourceId(row),
                  ),
                  copyAction(
                    text("JSON 복사", "Copy JSON"),
                    JSON.stringify(row, null, 2),
                  ),
                  { label: t("refresh"), disabled: busy, run: () => refresh() },
                ]}
              >
                <TableRow
                  className="group"
                  tabIndex={0}
                  onDoubleClick={() => detail(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget)
                      setSelected(row);
                  }}
                >
                  {cells(service, row).map((cell, i) => (
                    <TableCell key={i} className="px-5 py-4 text-xs">
                      {i === 0 ? (
                        <button
                          className="max-w-[360px] truncate text-left text-sm font-medium hover:text-accent-foreground hover:underline"
                          onClick={() => setSelected(row)}
                          title={String(cell)}
                        >
                          {cell}
                        </button>
                      ) : i === 1 &&
                        (service === "ec2" || service === "rds") ? (
                        <Badge variant="outline" className="font-normal">
                          <span
                            className={`mr-1 size-1.5 rounded-full ${["running", "available"].includes(cell) ? "bg-emerald-500" : "bg-slate-400"}`}
                          />
                          {cell}
                        </Badge>
                      ) : (
                        <span className={i > 2 ? "text-muted-foreground" : ""}>
                          {cell ?? "—"}
                        </span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${resourceId(row)} ${text("작업", "Actions")}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setSelected(row)}>
                          {text("빠른 상세", "Quick details")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => detail(row)}>
                          {text("상세 및 작업", "Details & actions")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              </ContextActions>
            ))}
          </TableBody>
        </Table>
        {!filtered.length && (
          <div className="p-12 text-center text-muted-foreground">
            {busy ? (
              <Loading />
            ) : (
              t(query || status !== "all" ? "noResults" : "empty")
            )}
          </div>
        )}
        <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
          <span>
            {page.updated
              ? `${t("updated")} ${new Date(page.updated).toLocaleTimeString(locale())}`
              : t("notLoaded")}{" "}
            · {service === "s3" ? t("accountWide") : ctx.region}
          </span>
          {page.nextToken && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => refresh(true)}
            >
              {t("next")}
            </Button>
          )}
        </div>
      </section>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <SheetContent
          closeLabel={t("close")}
          className="w-[min(760px,95vw)] overflow-y-auto sm:max-w-[760px]"
        >
          <SheetHeader className="border-b pb-5">
            <SheetTitle className="pr-6 break-all">
              {selected && resourceId(selected)}
            </SheetTitle>
            <SheetDescription>
              {ctx.profile} · {ctx.region}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-5 px-6 pb-6">
              <Button variant="outline" onClick={() => detail(selected)}>
                {text("상세 및 작업", "Details & actions")}
                <ChevronRight />
              </Button>
              {service === "s3" || service === "logs" ? (
                <Explorer
                  key={resourceId(selected)}
                  {...ctx}
                  service={service}
                  resource={resourceId(selected)}
                />
              ) : (
                <JsonBlock value={selected} />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
function AppContent() {
  const demo = !isTauri(),
    [profile, setProfile] = useState(""),
    [profiles, setProfiles] = useState<string[]>([]),
    [region, setRegion] = useState(
      localStorage.getItem("orbit.region") || "ap-northeast-2",
    ),
    [route, setRoute] = useState<Route>({ kind: "resources", service: "ec2" }),
    [prefs, setPrefs] = useState(readPreferences),
    [error, setError] = useState(""),
    [booting, setBooting] = useState(true),
    [version, setVersion] = useState(""),
    [account, setAccount] = useState(""),
    [revision, setRevision] = useState(0);
  const cache = useRef(new Map<string, Cached>()),
    bootEpoch = useRef(0);
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  async function bootstrap() {
    const id = ++bootEpoch.current;
    setBooting(true);
    setError("");
    try {
      const result = demo
        ? { profiles: ["workspace"], version: "" }
        : await invoke<{ profiles: string[]; version: string }>("bootstrap");
      if (id !== bootEpoch.current) return;
      setProfiles(result.profiles);
      setVersion(result.version);
      const saved = localStorage.getItem("orbit.profile") || "";
      setProfile(
        result.profiles.includes(saved) ? saved : result.profiles[0] || "",
      );
    } catch (e) {
      if (id === bootEpoch.current) setError(String(e));
    } finally {
      if (id === bootEpoch.current) setBooting(false);
    }
  }
  useEffect(() => {
    void bootstrap();
    return () => {
      bootEpoch.current++;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setAccount("");
    if (profile && !demo)
      void invoke<{ Account: string }>("account_identity", {
        query: { service: "ec2", profile, region, nextToken: null },
      })
        .then((v) => {
          if (active) setAccount(v.Account);
        })
        .catch(() => {
          if (active) setAccount(t("identityUnavailable"));
        });
    return () => {
      active = false;
    };
  }, [profile, region, demo]);
  function navigate(next: Route) {
    if (next.service) {
      rememberService(next.service);
      setPrefs(readPreferences());
    }
    setRoute(next);
    setRevision((v) => v + 1);
    if (isMobile) setOpenMobile(false);
  }
  const ctx: Context = {
    profile,
    region,
    demo,
    navigate,
    clearCache: () => cache.current.clear(),
  };
  const label = (s: string) =>
    ["ec2", "rds", "s3api", "logs"].includes(s)
      ? t((s === "s3api" ? "s3" : s) as Service)
      : s;
  const nav = (
    id: string,
    title: string,
    icon: React.ReactNode,
    next: Route,
  ) => (
    <SidebarMenuItem key={id}>
      <ContextActions
        actions={[
          { label: text("열기", "Open"), run: () => navigate(next) },
          ...(next.service
            ? [
                {
                  label: text("API 실행", "API Runner"),
                  run: () => navigate({ kind: "api", service: next.service }),
                },
                copyAction(
                  text("서비스 ID 복사", "Copy service ID"),
                  next.service,
                ),
              ]
            : []),
        ]}
      >
        <SidebarMenuButton
          tooltip={title}
          isActive={route.kind === next.kind && route.service === next.service}
          onClick={() => navigate(next)}
        >
          {icon}
          <span>{title}</span>
        </SidebarMenuButton>
      </ContextActions>
    </SidebarMenuItem>
  );
  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-16 justify-center px-3">
          <div className="flex items-center gap-2">
            <button
              aria-label={state === "collapsed" ? t("expand") : t("collapse")}
              onClick={toggleSidebar}
              className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent"
            >
              <Orbit className="size-5 text-foreground" />
            </button>
            <span className="flex-1 text-lg font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
              Orbit
              <span className="ml-2 text-[10px] font-medium tracking-widest text-muted-foreground">
                AWS
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="group-data-[collapsible=icon]:hidden"
              aria-label={t("collapse")}
              onClick={toggleSidebar}
            >
              <PanelLeft />
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav(
                  "catalog",
                  text("전체 서비스", "All services"),
                  <Grid2X2 />,
                  { kind: "catalog" },
                )}
                {nav(
                  "topology",
                  text("인프라 구조도", "Infrastructure map"),
                  <Network />,
                  { kind: "topology" },
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>
              {text("즐겨찾기", "Favorites")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {prefs.favorites.map((s) =>
                  nav(
                    s,
                    label(s),
                    <ServiceIcon service={s} />,
                    serviceRoute(s),
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {prefs.recent.some((s) => !prefs.favorites.includes(s)) && (
            <SidebarGroup>
              <SidebarGroupLabel>
                {text("최근 사용", "Recent")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {prefs.recent
                    .filter((s) => !prefs.favorites.includes(s))
                    .map((s) =>
                      nav(
                        s,
                        label(s),
                        <ServiceIcon service={s} />,
                        serviceRoute(s),
                      ),
                    )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="gap-3 border-t px-3 py-4">
          <SidebarMenu>
            {nav("settings", text("설정", "Settings"), <Settings2 />, {
              kind: "settings",
            })}
          </SidebarMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden group-data-[collapsible=icon]:flex"
            aria-label={`${t("profile")} / ${t("region")}`}
            onClick={toggleSidebar}
          >
            <Plug />
          </Button>
          <div className="space-y-3 group-data-[collapsible=icon]:hidden">
            <div className="space-y-1.5">
              <Label
                htmlFor="profile"
                className="text-[11px] text-muted-foreground"
              >
                {t("profile")}
              </Label>
              <SelectField
                id="profile"
                className="w-full bg-background text-xs"
                disabled={booting || demo}
                value={profile}
                onValueChange={(value) => {
                  setProfile(value);
                  localStorage.setItem("orbit.profile", value);
                  if (route.kind === "detail" || route.kind === "api")
                    navigate(serviceRoute(route.service!));
                }}
              >
                {!profiles.length && (
                  <SelectOption value="">{t("noProfiles")}</SelectOption>
                )}
                {profiles.map((p) => (
                  <SelectOption key={p} value={p}>
                    {p}
                  </SelectOption>
                ))}
              </SelectField>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="region"
                className="text-[11px] text-muted-foreground"
              >
                {t("region")}
              </Label>
              <Input
                id="region"
                className="h-9 bg-background text-xs"
                defaultValue={region}
                key={region}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (/^[a-z0-9-]{1,64}$/.test(v)) {
                    setRegion(v);
                    localStorage.setItem("orbit.region", v);
                    if (
                      v !== region &&
                      (route.kind === "detail" || route.kind === "api")
                    ) {
                      navigate(serviceRoute(route.service!));
                    }
                  } else e.target.value = region;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>
            {!demo && (
              <p
                className="truncate text-[10px] text-muted-foreground"
                title={version}
              >
                {account || t("identityLoading")}
              </p>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>
      <main
        className={`min-w-0 flex-1 px-6 py-8 lg:px-9 ${prefs.density === "compact" ? "compact" : ""}`}
      >
        <Button
          variant="outline"
          size="icon"
          className="mb-4 md:hidden"
          aria-label={t("expand")}
          onClick={toggleSidebar}
        >
          <PanelLeft />
        </Button>
        <ErrorPanel error={error} />
        {(error || (!profile && !booting)) && (
          <div className="my-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t("profileHelp")}</p>
            <Button variant="outline" onClick={bootstrap}>
              {t("reconnect")}
            </Button>
          </div>
        )}
        {booting ? (
          <Loading />
        ) : (
          <div key={`${profile}|${region}|${revision}`}>
            {route.kind === "resources" && (
              <Resources
                ctx={ctx}
                service={
                  (route.service === "s3api" ? "s3" : route.service) as Service
                }
                cache={cache.current}
              />
            )}
            {route.kind === "catalog" && (
              <Catalog
                ctx={ctx}
                onPreferences={() => setPrefs(readPreferences())}
              />
            )}
            {route.kind === "settings" && (
              <Settings
                ctx={ctx}
                onSave={(v) => {
                  setRegion(v);
                  localStorage.setItem("orbit.region", v);
                  setPrefs(readPreferences());
                }}
              />
            )}
            {route.kind === "detail" && <Details ctx={ctx} route={route} />}
            {route.kind === "api" && <ApiWorkbench ctx={ctx} route={route} />}
            {route.kind === "topology" && (
              <Suspense fallback={<Loading />}>
                <Topology {...ctx} />
              </Suspense>
            )}
          </div>
        )}
      </main>
    </>
  );
}
export default function App() {
  useTheme();
  const [open, setOpen] = useState(
    localStorage.getItem("orbit.collapsed") !== "true",
  );
  return (
    <SidebarProvider
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        localStorage.setItem("orbit.collapsed", String(!v));
      }}
    >
      <Notifications>
        <AppContent />
      </Notifications>
    </SidebarProvider>
  );
}
