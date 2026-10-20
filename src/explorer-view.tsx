import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Folder, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField, SelectOption } from "@/components/ui/select-field";
import { Label } from "@/components/ui/label";
import {
  ContextActions,
  copyAction,
  ErrorPanel,
  JsonBlock,
  Loading,
  useAlive,
} from "./shared-ui";
import { mergeRows } from "./pagination";
import { t, locale } from "./i18n";
import { text, type Row, type Page } from "./app-model";
type Props = {
  profile: string;
  region: string;
  demo: boolean;
  service: "s3" | "logs";
  resource: string;
};
export default function Explorer(ctx: Props) {
  const [rows, setRows] = useState<Row[]>([]),
    [next, setNext] = useState<string | null>(null),
    [prefix, setPrefix] = useState(""),
    [draft, setDraft] = useState(""),
    [hours, setHours] = useState(24),
    [pattern, setPattern] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useAlive(),
    epoch = useRef(0),
    pending = useRef(false),
    range = useRef({ startTime: 0, endTime: 0, pattern: "" });
  const isS3 = ctx.service === "s3";
  async function load(more = false, path = prefix) {
    if (pending.current) return;
    pending.current = true;
    const id = ++epoch.current;
    setBusy(true);
    setError("");
    const token = more ? next : null;
    if (!more) {
      const endTime = Date.now();
      range.current = {
        endTime,
        startTime: endTime - hours * 3600000,
        pattern,
      };
      setRows([]);
      setNext(null);
      setDetail(null);
      setPrefix(path);
      setDraft(path);
    }
    try {
      const page = ctx.demo
        ? {
            rows: isS3
              ? path
                ? [
                    {
                      kind: "file",
                      Key: path + "example.json",
                      Size: 128,
                      StorageClass: "STANDARD",
                    },
                  ]
                : [
                    { kind: "folder", Prefix: "assets/" },
                    {
                      kind: "file",
                      Key: "index.html",
                      Size: 2048,
                      StorageClass: "STANDARD",
                    },
                  ]
              : [
                  {
                    eventId: "event-001",
                    timestamp: Date.now(),
                    logStreamName: "stream-001",
                    message:
                      '{"level":"info","message":"Request completed","status":200}',
                  },
                ],
            nextToken: null,
          }
        : await invoke<Page>("browse_resources", {
            query: {
              profile: ctx.profile,
              region: ctx.region,
              kind: isS3 ? "objects" : "events",
              resource: ctx.resource,
              prefix: path,
              nextToken: token,
              ...range.current,
            },
          });
      if (!alive.current || epoch.current !== id) return;
      const merged = mergeRows(more ? rows : [], page.rows, (r) =>
        isS3
          ? `${r.kind}:${r.Prefix ?? r.Key}`
          : String(r.eventId ?? JSON.stringify(r)),
      );
      setRows(merged);
      setNext(
        page.nextToken && page.nextToken !== token ? page.nextToken : null,
      );
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const open = (row: Row) =>
    row.kind === "folder" ? void load(false, row.Prefix) : setDetail(row);
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t(isS3 ? "s3Files" : "logEvents")}</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => load()}
        >
          <RefreshCw />
          {t("refresh")}
        </Button>
      </div>
      <ErrorPanel error={error} />
      {isS3 ? (
        <>
          <nav
            aria-label={t("path")}
            className="flex flex-wrap items-center gap-1"
          >
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => load(false, "")}
            >
              {t("root")}
            </Button>
            {prefix
              .split("/")
              .filter(Boolean)
              .map((part, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    load(
                      false,
                      prefix
                        .split("/")
                        .slice(0, i + 1)
                        .join("/") + "/",
                    )
                  }
                >
                  / {part}
                </Button>
              ))}
          </nav>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void load(false, draft);
            }}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="object-prefix">{t("path")}</Label>
              <Input
                id="object-prefix"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
            <Button variant="outline" disabled={busy}>
              {t("go")}
            </Button>
          </form>
        </>
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="log-range">{t("range")}</Label>
              <SelectField
                id="log-range"
                value={hours}
                onValueChange={(value) => setHours(Number(value))}
              >
                {[
                  [1, t("hour1")],
                  [6, t("hour6")],
                  [24, t("day1")],
                  [168, t("day7")],
                  [720, t("day30")],
                ].map(([v, l]) => (
                  <SelectOption key={v} value={v}>
                    {l}
                  </SelectOption>
                ))}
              </SelectField>
            </div>
            <div className="min-w-48 flex-1 space-y-2">
              <Label htmlFor="log-pattern">{t("pattern")}</Label>
              <Input
                id="log-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder={t("patternHint")}
              />
            </div>
            <Button disabled={busy}>{t("apply")}</Button>
          </form>
          <p className="text-xs text-muted-foreground">
            {t("chronological")} ·{" "}
            {new Date(range.current.startTime).toLocaleString(locale())} –{" "}
            {new Date(range.current.endTime).toLocaleString(locale())}
          </p>
        </>
      )}
      <div className="divide-y rounded-lg border">
        {rows.map((r, i) =>
          isS3 ? (
            <ContextActions
              key={r.Prefix ?? r.Key}
              actions={[
                {
                  label: text("열기", "Open"),
                  disabled: busy,
                  run: () => open(r),
                },
                copyAction(
                  text("S3 URI 복사", "Copy S3 URI"),
                  `s3://${ctx.resource}/${r.Prefix ?? r.Key}`,
                ),
                copyAction(
                  text("키 / 경로 복사", "Copy key / prefix"),
                  r.Prefix ?? r.Key,
                ),
                copyAction(
                  text("JSON 복사", "Copy JSON"),
                  JSON.stringify(r, null, 2),
                ),
              ]}
            >
              <button
                disabled={busy}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted focus-visible:outline-ring"
                onClick={() => open(r)}
              >
                {r.kind === "folder" ? (
                  <Folder className="size-4 text-blue-600" />
                ) : (
                  <FileText className="size-4 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 break-all">
                  {String(r.Prefix ?? r.Key).slice(prefix.length)}
                  <small className="block text-muted-foreground">
                    {r.kind === "folder"
                      ? t("folder")
                      : `${r.Size ?? 0} B · ${r.StorageClass ?? "STANDARD"}`}
                  </small>
                </span>
              </button>
            </ContextActions>
          ) : (
            <ContextActions
              key={r.eventId ?? i}
              actions={[
                copyAction(
                  text("로그 본문 복사", "Copy log message"),
                  r.message,
                ),
                copyAction(
                  text("로그 스트림 이름 복사", "Copy log stream name"),
                  r.logStreamName,
                ),
                copyAction(
                  text("JSON 복사", "Copy JSON"),
                  JSON.stringify(r, null, 2),
                ),
              ]}
            >
              <article tabIndex={0} className="p-4">
                <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <time>{new Date(r.timestamp).toLocaleString(locale())}</time>
                  <span>{r.logStreamName}</span>
                </div>
                <pre className="json-body">{r.message}</pre>
              </article>
            </ContextActions>
          ),
        )}
      </div>
      {busy ? (
        <Loading />
      ) : !rows.length ? (
        <p className="py-6 text-center text-muted-foreground">
          {t(isS3 ? "noObjects" : "noEvents")}
        </p>
      ) : null}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows.length} {t("loaded")}
        </span>
        {next && (
          <Button variant="outline" disabled={busy} onClick={() => load(true)}>
            {t("next")}
          </Button>
        )}
      </div>
      {detail && (
        <div className="space-y-3">
          <h3 className="font-semibold">{t("fileInfo")}</h3>
          <p className="mono break-all text-xs">
            s3://{ctx.resource}/{detail.Key}
          </p>
          <JsonBlock value={detail} />
        </div>
      )}
    </section>
  );
}
