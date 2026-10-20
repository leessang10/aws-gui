import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorPanel, Loading, ServiceIcon } from "./shared-ui";
import { text } from "./app-model";
import { topologyCandidates, searchCandidates } from "./topology-selection";
import type { Inventory } from "./topology-data";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory?: Inventory;
  selectedIds: ReadonlySet<string>;
  busy: boolean;
  progress: string;
  error: string;
  profile: string;
  region: string;
  onRefresh: () => void;
  onCloseFocus?: () => void;
  includeConnected?: boolean;
  onLoad: (ids: Set<string>, includeConnected: boolean) => void;
};
export function ResourcePicker(p: Props) {
  const [draft, setDraft] = useState(new Set<string>()),
    [connected, setConnected] = useState(false),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(100);
  const candidates = p.inventory ? topologyCandidates(p.inventory) : [],
    matches = searchCandidates(candidates, query);
  useEffect(() => {
    if (p.open) {
      setDraft(new Set(p.selectedIds));
      setConnected(p.includeConnected ?? false);
      setQuery("");
      setLimit(100);
    }
  }, [p.open]);
  useEffect(() => {
    if (p.inventory) {
      const valid = new Set(topologyCandidates(p.inventory).map((n) => n.id));
      setDraft((ids) => new Set([...ids].filter((id) => valid.has(id))));
    }
  }, [p.inventory]);
  const all = matches.length > 0 && matches.every((n) => draft.has(n.id)),
    some = matches.some((n) => draft.has(n.id));
  const toggle = (id: string, checked: boolean) =>
    setDraft((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          if (p.onCloseFocus) {
            e.preventDefault();
            p.onCloseFocus();
          }
        }}
        className="flex max-h-[85vh] flex-col sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>{text("리소스 선택", "Select resources")}</DialogTitle>
          <DialogDescription>
            {p.profile} · {p.region}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            aria-label={text("리소스 검색", "Search resources")}
            placeholder={text("이름, ID, 종류 검색", "Search name, ID or type")}
            value={query}
            disabled={p.busy}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(100);
            }}
          />
          <Button variant="outline" disabled={p.busy} onClick={p.onRefresh}>
            {text("새로고침", "Refresh")}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={connected}
            disabled={p.busy}
            onCheckedChange={(value) => setConnected(value === true)}
          />
          {text("연결된 리소스 함께 불러오기", "Include connected resources")}
        </label>
        <ErrorPanel error={p.error} />
        {p.inventory?.warnings.length ? (
          <details className="text-xs text-muted-foreground">
            <summary>
              {text("조회 알림", "Collection notices")} ·{" "}
              {p.inventory.warnings.length}
            </summary>
            {p.inventory.warnings.map((w, i) => (
              <p key={i} className="break-all py-1">
                {w}
              </p>
            ))}
          </details>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2">
            <Checkbox
              disabled={p.busy || !matches.length}
              checked={all ? true : some ? "indeterminate" : false}
              onCheckedChange={(checked) =>
                setDraft((current) => {
                  const next = new Set(current);
                  matches.forEach((n) =>
                    checked === true ? next.add(n.id) : next.delete(n.id),
                  );
                  return next;
                })
              }
            />
            {text("검색 결과 전체 선택", "Select all results")}
          </label>
          <span className="text-muted-foreground">
            {matches.length} {text("개", "resources")} · {draft.size}{" "}
            {text("개 선택", "selected")}
          </span>
        </div>
        <div
          className="min-h-32 overflow-y-auto rounded-lg border"
          aria-busy={p.busy}
        >
          {p.busy ? (
            <div className="px-4">
              <Loading />
              <p
                role="status"
                className="pb-4 text-xs text-muted-foreground break-all"
              >
                {p.progress}
              </p>
            </div>
          ) : matches.length ? (
            <div className="divide-y">
              {matches.slice(0, limit).map((n) => (
                <label
                  key={n.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <Checkbox
                    aria-label={`${n.kind.toUpperCase()} ${n.name}`}
                    checked={draft.has(n.id)}
                    onCheckedChange={(checked) =>
                      toggle(n.id, checked === true)
                    }
                  />
                  <ServiceIcon service={n.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {n.name}
                    </span>
                    <span
                      className="block truncate text-xs text-muted-foreground"
                      title={n.id}
                    >
                      {n.id}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {n.kind.toUpperCase()}
                  </span>
                </label>
              ))}
              {matches.length > limit && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLimit((v) => v + 100)}
                >
                  {text("더 보기", "Show more")} ({limit}/{matches.length})
                </Button>
              )}
            </div>
          ) : (
            <p className="p-8 text-center text-muted-foreground">
              {text("검색 결과 없음", "No results")}
            </p>
          )}
        </div>
        <DialogFooter className="mt-auto flex-row items-center sm:justify-between">
          <Button
            variant="ghost"
            disabled={p.busy || !draft.size}
            onClick={() => setDraft(new Set())}
          >
            {text("선택 해제", "Clear selection")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => p.onOpenChange(false)}>
              {text("취소", "Cancel")}
            </Button>
            <Button
              disabled={p.busy || !draft.size}
              onClick={() => p.onLoad(new Set(draft), connected)}
            >
              {text("불러오기", "Load")} ({draft.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
