import { useTheme, type ThemeMode } from "./theme";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  text,
  resourceId,
  type Context,
  type Route,
  type Row,
} from "./app-model";
import {
  Heading,
  ErrorPanel,
  JsonBlock,
  Loading,
  ServiceIcon,
  ContextActions,
  copyAction,
  useAlive,
} from "./shared-ui";
import { language, setLanguage, type Language } from "./i18n";
import {
  readPreferences,
  savePreferences,
  filterCatalog,
  category,
  type CatalogService,
} from "./workspace-state";
import { resourceActions } from "./resource-actions";
import Explorer from "./explorer-view";
import preview from "./catalog-preview.json";
export const native = ["ec2", "rds", "s3api", "logs"];
export function serviceRoute(service: string): Route {
  return { kind: native.includes(service) ? "resources" : "api", service };
}
let catalog: Promise<CatalogService[]> | undefined;
let advanced = false;
export function Catalog({
  ctx,
  onPreferences,
}: {
  ctx: Context;
  onPreferences: () => void;
}) {
  const [items, setItems] = useState<CatalogService[]>([]),
    [query, setQuery] = useState(""),
    [group, setGroup] = useState(""),
    [error, setError] = useState(""),
    [pins, setPins] = useState(readPreferences().favorites);
  const alive = useAlive();
  useEffect(() => {
    void (
      ctx.demo
        ? Promise.resolve(preview)
        : (catalog ??= invoke<CatalogService[]>("service_catalog").catch(
            (e) => {
              catalog = undefined;
              throw e;
            },
          ))
    )
      .then((v) => {
        if (alive.current) setItems(v);
      })
      .catch((e) => {
        if (alive.current) setError(String(e));
      });
  }, []);
  function pin(id: string) {
    const p = readPreferences();
    if (p.favorites.includes(id))
      p.favorites = p.favorites.filter((v) => v !== id);
    else if (p.favorites.length < 8) p.favorites.push(id);
    else
      return setError(
        text("즐겨찾기는 최대 8개입니다.", "Keep at most eight favorites."),
      );
    savePreferences(p);
    setPins(p.favorites);
    onPreferences();
  }
  const result = filterCatalog(items, query, group);
  return (
    <>
      <Heading
        title={text("전체 서비스", "All services")}
        description={text("AWS 서비스 및 API", "AWS services and APIs")}
      />
      <div className="mb-5 flex gap-3">
        <div className="relative max-w-xl flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label={text("서비스 검색", "Search services")}
            placeholder={text(
              "서비스 이름 또는 CLI ID 검색",
              "Search service name or CLI ID",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label={text("분류", "Category")}
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">{text("전체 분류", "All categories")}</option>
          {[
            "Compute",
            "Storage",
            "Database",
            "Security",
            "Management",
            "Network",
            "AI / ML",
            "Analytics",
            "Other",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </NativeSelect>
      </div>
      <ErrorPanel error={error} />
      <p className="mb-4 text-xs text-muted-foreground" role="status">
        {result.length} / {items.length}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {result.map((s) => (
          <ContextActions
            key={s.id}
            actions={[
              {
                label: text("서비스 열기", "Open service"),
                run: () => ctx.navigate(serviceRoute(s.id)),
              },
              {
                label: text("API 작업대", "API workbench"),
                run: () => ctx.navigate({ kind: "api", service: s.id }),
              },
              {
                label: text(
                  pins.includes(s.id) ? "즐겨찾기에서 제거" : "즐겨찾기에 추가",
                  pins.includes(s.id) ? "Remove favorite" : "Add favorite",
                ),
                run: () => pin(s.id),
              },
              copyAction(text("서비스 ID 복사", "Copy service ID"), s.id),
            ]}
          >
            <Card className="gap-3 py-4 shadow-none transition-colors hover:border-ring/50">
              <CardContent className="px-4">
                <div className="flex items-start gap-3">
                  <span className="rounded-md border bg-muted/50 p-2">
                    <ServiceIcon service={s.id} />
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => ctx.navigate(serviceRoute(s.id))}
                  >
                    <span className="block font-semibold">{s.id}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {s.name}
                    </span>
                  </button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${s.id} ${text("즐겨찾기", "favorite")}`}
                    aria-pressed={pins.includes(s.id)}
                    onClick={() => pin(s.id)}
                  >
                    <Star
                      className={
                        pins.includes(s.id)
                          ? "fill-current text-amber-600"
                          : "text-muted-foreground"
                      }
                    />
                  </Button>
                </div>
                <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                  <span>{category(s.id)}</span>
                  <span>{s.operations} APIs</span>
                </div>
              </CardContent>
            </Card>
          </ContextActions>
        ))}
      </div>
      {!items.length && !error && <Loading />}
    </>
  );
}
export function Settings({
  ctx,
  onSave,
}: {
  ctx: Context;
  onSave: (region: string) => void;
}) {
  const theme = useTheme();
  const [lang, setLang] = useState<Language>(language),
    [density, setDensity] = useState(readPreferences().density),
    [region, setRegion] = useState(ctx.region),
    [enabled, setEnabled] = useState(advanced),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <Heading
        title={text("설정", "Settings")}
        description={text(
          "표시 환경과 연결, AWS 작업 범위를 관리합니다.",
          "Manage appearance, connection, and AWS action controls.",
        )}
      />
      <ErrorPanel error={error} />
      <form
        id="preferences-form"
        className="grid max-w-4xl gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (!/^[a-z0-9-]{1,64}$/.test(region))
            return setError(
              text("리전 형식을 확인하세요.", "Enter a valid region."),
            );
          setLanguage(lang);
          savePreferences({ ...readPreferences(), density });
          onSave(region);
          setStatus(text("설정을 저장했습니다.", "Preferences saved."));
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{text("표시", "Appearance")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pref-theme">{text("테마", "Theme")}</Label>
              <NativeSelect
                id="pref-theme"
                wrapperClassName="w-full"
                value={theme.mode}
                onChange={(e) => theme.setMode(e.target.value as ThemeMode)}
              >
                <option value="light">{text("라이트", "Light")}</option>
                <option value="dark">{text("다크", "Dark")}</option>
                <option value="system">{text("시스템", "System")}</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pref-language">{text("언어", "Language")}</Label>
              <NativeSelect
                wrapperClassName="w-full"
                id="pref-language"
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
              >
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pref-density">
                {text("목록 밀도", "Table density")}
              </Label>
              <NativeSelect
                wrapperClassName="w-full"
                id="pref-density"
                value={density}
                onChange={(e) => setDensity(e.target.value as typeof density)}
              >
                <option value="comfortable">
                  {text("기본", "Comfortable")}
                </option>
                <option value="compact">{text("촘촘하게", "Compact")}</option>
              </NativeSelect>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{text("연결", "Connection")}</CardTitle>
            <CardDescription>
              {text(
                "인증 정보는 AWS CLI에서 관리합니다. 앱은 자격 증명 파일을 수정하지 않습니다.",
                "Credentials are managed by AWS CLI. Orbit does not edit credential files.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="pref-region">
              {text("기본 리전", "Default region")}
            </Label>
            <Input
              id="pref-region"
              className="max-w-sm"
              required
              pattern="[a-z0-9-]{1,64}"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </CardContent>
        </Card>
      </form>
      <div className="mt-5 grid max-w-4xl gap-5">
        <Card>
          <CardHeader>
            <CardTitle>
              {text("고급 API 작업", "Advanced API actions")}
            </CardTitle>
            <CardDescription>
              {text(
                "앱을 다시 시작하면 해제됩니다. 실행할 때마다 계정과 요청을 별도로 확인합니다.",
                "Disabled on restart. Each execution requires a separate account and request review.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Switch
                id="advanced"
                checked={enabled}
                disabled={ctx.demo || busy}
                onCheckedChange={async (value) => {
                  setBusy(true);
                  try {
                    await invoke("set_advanced_enabled", { enabled: value });
                    advanced = value;
                    setEnabled(value);
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <Label htmlFor="advanced">
                {text(
                  "이번 실행 세션에서 변경 가능한 API 허용",
                  "Allow potentially mutating APIs for this session",
                )}
              </Label>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{text("데이터 관리", "Data management")}</CardTitle>
            <CardDescription>
              {text(
                "즐겨찾기·언어·리전 설정만 저장합니다. API 입력과 결과는 저장하지 않습니다.",
                "Preferences and navigation history persist. API inputs and results are not saved.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => {
                ctx.clearCache();
                setStatus(
                  text("캐시를 비웠습니다.", "Resource cache cleared."),
                );
              }}
            >
              {text("리소스 캐시 비우기", "Clear resource cache")}
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 flex max-w-4xl flex-wrap items-center justify-end gap-3 border-t pt-4">
        <p role="status" className="min-w-0 flex-1 text-sm text-muted-foreground">
          {status}
        </p>
        <Button type="submit" form="preferences-form">
          {text("설정 저장", "Save preferences")}
        </Button>
      </div>
    </>
  );
}
export function ResourceActions({
  service,
  row,
  onReview,
}: {
  service: string;
  row: Row;
  onReview: (operation: string, input: Record<string, unknown>) => void;
}) {
  const actions = resourceActions(service, row),
    [operation, setOperation] = useState(""),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  const action = actions.find((a) => a.operation === operation);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.operation}
            type="button"
            variant="outline"
            className={a.danger ? "text-destructive" : ""}
            onClick={(e) => {
              trigger.current = e.currentTarget;
              setOperation(a.operation);
              setValue("");
              setError("");
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {action && (
        <Card>
          <CardHeader>
            <CardTitle>{action.label}</CardTitle>
            <CardDescription>{action.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  onReview(action.operation, action.input(value.trim()));
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              <p className="mono text-xs">{resourceId(row)}</p>
              {action.field && (
                <div className="space-y-2">
                  <Label htmlFor="action-value">{action.field.label}</Label>
                  {action.field.options ? (
                    <NativeSelect
                      id="action-value"
                      required
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    >
                      <option value="">
                        {text("선택하세요", "Choose a value")}
                      </option>
                      {action.field.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id="action-value"
                      required
                      pattern={action.field.pattern}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  )}
                </div>
              )}
              <ErrorPanel error={error} />
              <div className="flex gap-2">
                <Button>
                  {text("요청 작성 및 검토", "Prepare and review")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOperation("");
                    trigger.current?.focus();
                  }}
                >
                  {text("취소", "Cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
export function Details({ ctx, route }: { ctx: Context; route: Route }) {
  const row = route.resource!,
    service = route.service!,
    id = resourceId(row),
    editable =
      service === "ec2" ||
      service === "logs" ||
      (service === "rds" && !String(row.Engine).startsWith("aurora"));
  const [value, setValue] = useState(
    String(
      service === "ec2"
        ? (row.Tags?.find((t: Row) => t.Key === "Name")?.Value ?? "")
        : service === "rds"
          ? (row.BackupRetentionPeriod ?? "")
          : (row.retentionInDays ?? ""),
    ),
  );
  const review = (operation: string, input: Record<string, unknown>) =>
    ctx.navigate({ kind: "api", service, operation, input });
  return (
    <>
      <Button
        variant="ghost"
        className="mb-4 -ml-3"
        onClick={() => ctx.navigate(serviceRoute(service))}
      >
        <ArrowLeft />
        {text("목록", "Resources")}
      </Button>
      <Heading title={id} description={text("리소스 상세", "Resource details")}>
        <Button
          variant="outline"
          onClick={() => ctx.navigate({ kind: "api", service })}
        >
          {text("API 작업대", "API workbench")}
        </Button>
      </Heading>
      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">{text("개요", "Overview")}</TabsTrigger>
          {(service === "s3api" || service === "logs") && (
            <TabsTrigger value="browse">
              {text(
                service === "s3api" ? "파일" : "로그 본문",
                service === "s3api" ? "Files" : "Log events",
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="actions">
            {text("작업 및 수정", "Actions & edit")}
          </TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(row)
              .filter(([, v]) => v === null || typeof v !== "object")
              .map(([k, v]) => (
                <ContextActions
                  key={k}
                  actions={[
                    copyAction(text("값 복사", "Copy value"), v),
                    copyAction(text("필드 이름 복사", "Copy field name"), k),
                  ]}
                >
                  <div tabIndex={0} className="bg-background p-4">
                    <dt className="mb-2 text-xs text-muted-foreground">{k}</dt>
                    <dd className="break-all text-sm">{String(v ?? "—")}</dd>
                  </div>
                </ContextActions>
              ))}
          </dl>
        </TabsContent>
        <TabsContent value="browse">
          {(service === "s3api" || service === "logs") && (
            <Explorer
              {...ctx}
              service={service === "s3api" ? "s3" : "logs"}
              resource={id}
            />
          )}
        </TabsContent>
        <TabsContent value="actions" className="max-w-3xl space-y-5">
          <ResourceActions service={service} row={row} onReview={review} />
          {editable && (
            <Card>
              <CardHeader>
                <CardTitle>{text("수정", "Edit")}</CardTitle>
                <CardDescription>
                  {text(
                    "값을 입력한 뒤 다음 화면에서 요청을 검토합니다.",
                    "Enter a new value, then review the request on the next screen.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    review(
                      service === "ec2"
                        ? "create-tags"
                        : service === "rds"
                          ? "modify-db-instance"
                          : "put-retention-policy",
                      service === "ec2"
                        ? {
                            Resources: [id],
                            Tags: [{ Key: "Name", Value: value }],
                          }
                        : service === "rds"
                          ? {
                              DBInstanceIdentifier: id,
                              BackupRetentionPeriod: Number(value),
                              ApplyImmediately: false,
                            }
                          : {
                              logGroupName: id,
                              retentionInDays: Number(value),
                            },
                    );
                  }}
                >
                  <Label htmlFor="edit-value">
                    {service === "ec2"
                      ? "Name tag"
                      : text(
                          service === "rds"
                            ? "백업 보존 기간(일)"
                            : "로그 보존 기간(일)",
                          service === "rds"
                            ? "Backup retention (days)"
                            : "Log retention (days)",
                        )}
                  </Label>
                  {service === "ec2" ? (
                    <Input
                      id="edit-value"
                      maxLength={256}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  ) : (
                    <NativeSelect
                      id="edit-value"
                      required
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    >
                      <option value="">
                        {text("기간 선택", "Choose duration")}
                      </option>
                      {(service === "rds"
                        ? Array.from({ length: 36 }, (_, n) => n)
                        : [
                            1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400,
                            545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653,
                          ]
                      ).map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </NativeSelect>
                  )}
                  {service === "rds" && (
                    <p className="text-xs leading-6 text-muted-foreground">
                      {text(
                        "0일은 자동 백업을 비활성화합니다. 백업 활성화·비활성화 시 I/O가 일시 중단될 수 있습니다. 0이 아닌 기간 간 변경은 유지보수 시간 전에 적용될 수 있습니다.",
                        "Zero disables automated backups. Enabling/disabling may suspend I/O. Changes between nonzero periods may apply before the maintenance window.",
                      )}
                    </p>
                  )}
                  <Button>{text("변경 요청 작성", "Prepare change")}</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="json">
          <JsonBlock value={row} />
        </TabsContent>
      </Tabs>
    </>
  );
}
type Operation = {
  name: string;
  readOnly: boolean;
  supported: boolean;
  fields: { name: string; type: string; required: boolean }[];
};
type Review = { id: string; account: string; phrase: string };
export function ApiWorkbench({ ctx, route }: { ctx: Context; route: Route }) {
  const service = route.service!;
  const [operations, setOperations] = useState<Operation[]>([]),
    [selected, setSelected] = useState<Operation>(),
    [query, setQuery] = useState(""),
    [input, setInput] = useState(JSON.stringify(route.input ?? {}, null, 2)),
    [review, setReview] = useState<Review>(),
    [reviewed, setReviewed] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [result, setResult] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useAlive(),
    pending = useRef(false),
    epoch = useRef(0);
  const invalidate = () => {
    epoch.current++;
    setReview(undefined);
    setConfirmation("");
  };
  useEffect(() => {
    const fallback: Operation = {
      name:
        route.operation ??
        ({
          ec2: "describe-instances",
          rds: "describe-db-instances",
          s3api: "list-buckets",
          logs: "describe-log-groups",
          lambda: "list-functions",
          sts: "get-caller-identity",
        }[service] ||
          "operation"),
      readOnly: !route.operation,
      supported: true,
      fields: Object.keys(route.input ?? {}).map((name) => ({
        name,
        type: "value",
        required: true,
      })),
    };
    void (
      ctx.demo
        ? Promise.resolve([fallback])
        : invoke<Operation[]>("service_operations", { service })
    )
      .then((items) => {
        if (!alive.current) return;
        setOperations(items);
        const op = route.operation
          ? items.find((o) => o.name === route.operation)
          : (items.find((o) => o.readOnly && o.supported) ?? items[0]);
        setSelected(op);
        if (!op)
          setError(text("작업을 찾을 수 없습니다.", "Operation not found."));
      })
      .catch((e) => {
        if (alive.current) setError(String(e));
      });
  }, []);
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function prepare() {
    if (!selected?.supported) return;
    await run(async () => {
      invalidate();
      const id = epoch.current;
      const value: unknown = JSON.parse(input);
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw Error(
          text("JSON 객체를 입력하세요.", "Input must be a JSON object."),
        );
      const output = ctx.demo
        ? {
            id: "offline",
            account: "000000000000",
            phrase: `000000000000 ${service} ${selected.name}`,
          }
        : await invoke<Review>("prepare_api", {
            query: {
              service,
              operation: selected.name,
              profile: ctx.profile,
              region: ctx.region,
              input: value,
            },
          });
      if (alive.current && id === epoch.current) {
        setReview(output);
        setReviewed(JSON.stringify(value, null, 2));
      }
    });
  }
  return (
    <>
      <Button
        variant="ghost"
        className="mb-4 -ml-3"
        onClick={() => ctx.navigate({ kind: "catalog" })}
      >
        <ArrowLeft />
        {text("전체 서비스", "All services")}
      </Button>
      <Heading
        title={service}
        description={text(
          "작업과 입력을 선택한 뒤 대상 계정과 요청을 검토하세요.",
          "Choose an operation and input, then review the account and request.",
        )}
      />
      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Input
            aria-label={text("작업 검색", "Find operation")}
            placeholder={text("작업 검색", "Find operation")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-[65vh] space-y-1 overflow-auto rounded-lg border p-2">
            {operations
              .filter((o) => o.name.includes(query.toLowerCase()))
              .map((o) => (
                <ContextActions
                  key={o.name}
                  actions={[
                    copyAction(
                      text("작업 이름 복사", "Copy operation name"),
                      o.name,
                    ),
                    copyAction(
                      text("CLI 명령 이름 복사", "Copy CLI command name"),
                      `aws ${service} ${o.name}`,
                    ),
                  ]}
                >
                  <button
                    disabled={busy}
                    className={`w-full rounded-md px-3 py-2.5 text-left text-xs hover:bg-muted ${selected?.name === o.name ? "bg-accent text-accent-foreground" : ""}`}
                    onClick={() => {
                      invalidate();
                      setSelected(o);
                      setInput("{}");
                      setResult(undefined);
                    }}
                  >
                    <span className="block break-all font-medium">
                      {o.name}
                    </span>
                    <small className="mt-1 block text-muted-foreground">
                      {text(
                        !o.supported
                          ? "미지원"
                          : o.readOnly
                            ? "조회"
                            : "검토 필요",
                        !o.supported
                          ? "Unsupported"
                          : o.readOnly
                            ? "Read"
                            : "Review required",
                      )}
                    </small>
                  </button>
                </ContextActions>
              ))}
          </div>
        </aside>
        <section className="min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              {selected?.name ?? text("작업 선택", "Select an operation")}
            </h2>
            {selected && (
              <Badge variant="secondary">
                {text(
                  selected.readOnly ? "조회" : "변경 가능",
                  selected.readOnly ? "Read" : "May modify",
                )}
              </Badge>
            )}
          </div>
          {selected && !selected.supported && (
            <ErrorPanel
              error={text(
                "바이너리·스트리밍 작업은 별도 어댑터가 필요합니다.",
                "Binary/streaming operation requires a dedicated adapter.",
              )}
            />
          )}
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {text("입력 필드", "Input fields")} (
              {selected?.fields.length ?? 0})
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {selected?.fields.map((f) => (
                <Badge variant="outline" key={f.name}>
                  {f.name} · {f.type}
                  {f.required ? " *" : ""}
                </Badge>
              ))}
            </div>
          </details>
          <div className="flex items-center justify-between">
            <Label htmlFor="api-input">
              {text("요청 JSON", "Request JSON")}
            </Label>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !selected?.supported}
              onClick={() =>
                run(async () => {
                  invalidate();
                  const output = ctx.demo
                    ? JSON.stringify(
                        Object.fromEntries(
                          selected!.fields.map((f) => [f.name, ""]),
                        ),
                        null,
                        2,
                      )
                    : await invoke<string>("api_skeleton", {
                        service,
                        operation: selected!.name,
                      });
                  if (alive.current) setInput(output);
                })
              }
            >
              {text("입력 예시 생성", "Generate skeleton")}
            </Button>
          </div>
          <Textarea
            id="api-input"
            className="mono min-h-64 text-xs leading-6"
            spellCheck={false}
            disabled={busy}
            value={input}
            onChange={(e) => {
              invalidate();
              setInput(e.target.value);
            }}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {text(
              "API 한 페이지씩 조회합니다. 다음 페이지는 응답 커서를 요청에 넣어 조회하세요. 입력 예시에서 불필요한 필드는 삭제하세요.",
              "One API page per request. Supply the response cursor for the next page. Remove unused skeleton fields.",
            )}
          </p>
          <Button disabled={busy || !selected?.supported} onClick={prepare}>
            {text("요청 검토", "Review request")}
          </Button>
          <ErrorPanel error={error} />
          {busy && <Loading />}
          {review && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {text("실행 전 검토", "Review before execution")}
                </CardTitle>
                <CardDescription>
                  {review.account} / {ctx.profile} · {ctx.region} · {service}{" "}
                  {selected?.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <JsonBlock value={reviewed} />
                <p className="text-sm text-muted-foreground">
                  {ctx.demo
                    ? text("AWS 연결을 확인하세요.", "AWS connection required.")
                    : selected?.readOnly
                      ? text(
                          "표시된 계정에서 조회 요청을 실행합니다.",
                          "Executes a read request in the displayed account.",
                        )
                      : text(
                          "리소스가 변경되며 비용이 발생할 수 있습니다.",
                          "Changes resources and may incur charges.",
                        )}
                </p>
                <Label htmlFor="api-confirm">
                  {text(
                    "아래 문구를 입력하여 확인",
                    "Type this phrase to confirm",
                  )}
                </Label>
                <code className="block break-all text-xs">{review.phrase}</code>
                <Input
                  id="api-confirm"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
                <Button
                  disabled={busy || confirmation !== review.phrase}
                  onClick={() =>
                    run(async () => {
                      const prepared = review;
                      invalidate();
                      const output = ctx.demo
                        ? JSON.stringify({
                            executed: false,
                            service,
                            operation: selected?.name,
                            reason: "AWS connection unavailable",
                          })
                        : await invoke<string>("execute_api", {
                            reviewId: prepared.id,
                            confirmation,
                          });
                      if (!alive.current) return;
                      ctx.clearCache();
                      let formatted = output;
                      try {
                        formatted = JSON.stringify(JSON.parse(output), null, 2);
                      } catch {
                        /* plain CLI output */
                      }
                      setResult(
                        formatted ||
                          text(
                            "성공 · 응답 본문 없음",
                            "Success · empty response body",
                          ),
                      );
                    })
                  }
                >
                  {ctx.demo
                    ? text("요청 확인", "Check request")
                    : text("확인한 요청 실행", "Execute reviewed request")}
                </Button>
              </CardContent>
            </Card>
          )}
          {result !== undefined && (
            <section className="space-y-3">
              <h3 className="font-semibold">{text("실행 결과", "Result")}</h3>
              <JsonBlock value={result} />
            </section>
          )}
        </section>
      </div>
    </>
  );
}
