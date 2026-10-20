import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import {
  Server,
  Database,
  HardDrive,
  ScrollText,
  Box,
  Network,
  Copy,
  LoaderCircle,
  Target,
  Zap,
  Radio,
  Layers,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import { text } from "./app-model";
export function ServiceIcon({
  service,
  className = "size-4",
}: {
  service: string;
  className?: string;
}) {
  const Icon =
    (
      {
        ec2: Server,
        rds: Database,
        s3: HardDrive,
        s3api: HardDrive,
        logs: ScrollText,
        vpc: Network,
        subnet: Network,
        lb: Network,
        tg: Network,
        elb: Network,
        target: Target,
        lambda: Zap,
        sns: Radio,
        sqs: Layers,
        eventbridge: Workflow,
      } as Record<string, typeof Box>
    )[service] || Box;
  return <Icon className={className} aria-hidden />;
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="min-w-0">
        <h1 className="break-all">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
export function ErrorPanel({ error }: { error: unknown }) {
  return error ? (
    <Alert variant="destructive">
      <AlertDescription className="whitespace-pre-wrap break-all">
        {String(error)}
      </AlertDescription>
    </Alert>
  ) : null;
}
export function Loading() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 py-8 text-muted-foreground"
    >
      <LoaderCircle className="size-4 animate-spin" />
      {text("불러오는 중…", "Loading…")}
    </div>
  );
}
export type MenuAction = {
  label: string;
  run: () => void | Promise<unknown>;
  disabled?: boolean;
  danger?: boolean;
};
export const copyAction = (label: string, value: unknown): MenuAction => ({
  label,
  run: async () => {
    await navigator.clipboard.writeText(String(value ?? ""));
    toast.success(text("복사했습니다.", "Copied."));
  },
});
export function ContextActions({
  children,
  actions,
}: {
  children: ReactElement;
  actions: MenuAction[];
}) {
  const source = useRef<HTMLElement | null>(null);
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          asChild
          onContextMenuCapture={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "input,textarea,select,[contenteditable=true]",
              ) ||
              window.getSelection()?.toString()
            )
              e.stopPropagation();
            else
              source.current =
                (e.target as HTMLElement).closest<HTMLElement>(
                  "button,[tabindex],a",
                ) ?? e.currentTarget;
          }}
          onKeyDown={(e) => {
            if (
              (e.target as HTMLElement).closest(
                "input,textarea,select,[contenteditable=true]",
              ) ||
              window.getSelection()?.toString()
            )
              return;
            if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              e.preventDefault();
              source.current = e.currentTarget;
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  clientX: r.left + 10,
                  clientY: r.top + 10,
                }),
              );
            }
          }}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            source.current?.focus();
          }}
        >
          {actions.map((a, i) => (
            <ContextMenuItem
              key={i}
              disabled={a.disabled}
              className={a.danger ? "text-destructive" : ""}
              onSelect={() => {
                Promise.resolve()
                  .then(a.run)
                  .catch((e) => toast.error(String(e)));
              }}
            >
              {a.label}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}
export function JsonBlock({ value }: { value: unknown }) {
  const content =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="relative rounded-lg border bg-muted/40">
      <div className="flex items-center justify-end gap-2 border-b px-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            navigator.clipboard
              .writeText(content)
              .then(() => toast.success(text("복사했습니다.", "Copied.")))
              .catch((e) => toast.error(String(e)))
          }
        >
          <Copy />
          {text("복사", "Copy")}
        </Button>
      </div>
      <ContextActions
        actions={[copyAction(text("JSON 복사", "Copy JSON"), content)]}
      >
        <pre tabIndex={0} className="json-body max-h-[480px] overflow-auto p-4">
          {content}
        </pre>
      </ContextActions>
    </div>
  );
}
export function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
