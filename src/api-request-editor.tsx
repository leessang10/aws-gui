import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiInputForm } from "./api-input-form";
import { parseApiInput, type ApiSchema } from "./api-schema";
import { ErrorPanel, Loading } from "./shared-ui";
import { text } from "./app-model";

type Props = {
  service: string;
  operation: string;
  demo: boolean;
  input: string;
  fields: { name: string; type: string; required: boolean }[];
  disabled: boolean;
  onChange: (value: string) => void;
  onSchema: (schema: ApiSchema | undefined) => void;
  onReady?: (ready: boolean) => void;
};

export function ApiRequestEditor(props: Props) {
  const [mode, setMode] = useState("form");
  const [schema, setSchema] = useState<ApiSchema>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    props.onReady?.(mode === "json" || (!loading && !!schema && !error));
  }, [mode, loading, schema, error]);
  useEffect(() => {
    let active = true;
    setSchema(undefined);
    props.onSchema(undefined);
    setError("");
    setLoading(true);
    const work = props.demo
      ? Promise.resolve({
          root: "Input",
          shapes: {
            Input: {
              type: "structure",
              required: props.fields
                .filter((f) => f.required)
                .map((f) => f.name),
              members: Object.fromEntries(
                props.fields.map((f) => [f.name, { shape: f.name }]),
              ),
            },
            ...Object.fromEntries(
              props.fields.map((f) => [f.name, { type: f.type }]),
            ),
          },
        } as ApiSchema)
      : invoke<ApiSchema>("api_input_schema", {
          service: props.service,
          operation: props.operation,
        });
    void work
      .then((value) => {
        if (!active) return;
        if (!value?.root || !value.shapes?.[value.root])
          throw Error(
            text(
              "입력 옵션을 불러오지 못했습니다.",
              "Input schema unavailable.",
            ),
          );
        setSchema(value);
        props.onSchema(value);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.service, props.operation, props.demo, retry]);
  let value: Record<string, unknown> | undefined;
  let parseError = "";
  try {
    value = parseApiInput(props.input);
  } catch (e) {
    parseError = String(e);
  }
  return (
    <div className="space-y-4">
      <Tabs
        value={mode}
        onValueChange={(next) => {
          if (next === "form" && parseError) {
            toast.error(
              text(
                "JSON을 수정한 후 폼으로 전환하세요.",
                "Fix the JSON before switching to the form.",
              ),
            );
            return;
          }
          setMode(next);
        }}
      >
        <TabsList aria-label={text("입력 모드", "Input mode")}>
          <TabsTrigger value="form" disabled={props.disabled}>
            {text("옵션 입력", "Form")}
          </TabsTrigger>
          <TabsTrigger value="json" disabled={props.disabled}>
            JSON
          </TabsTrigger>
        </TabsList>
        <TabsContent value="json" className="space-y-2">
          <Label htmlFor="api-input">{text("요청 JSON", "Request JSON")}</Label>
          <Textarea
            id="api-input"
            className="mono min-h-64 text-xs leading-6"
            spellCheck={false}
            disabled={props.disabled}
            value={props.input}
            onChange={(e) => props.onChange(e.target.value)}
          />
        </TabsContent>
        <TabsContent value="form">
          {loading ? (
            <Loading />
          ) : error ? (
            <div className="space-y-2">
              <ErrorPanel error={error} />
              <Button
                type="button"
                variant="outline"
                disabled={props.disabled}
                onClick={() => setRetry((n) => n + 1)}
              >
                {text("다시 시도", "Retry")}
              </Button>
            </div>
          ) : parseError ? (
            <ErrorPanel error={parseError} />
          ) : schema && value ? (
            <ApiInputForm
              key={props.operation}
              schema={schema}
              value={value}
              disabled={props.disabled}
              onChange={(next) => props.onChange(JSON.stringify(next, null, 2))}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
