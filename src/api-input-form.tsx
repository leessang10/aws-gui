import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField, SelectOption } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import { text } from "./app-model";
import {
  defaultShapeValue,
  descriptionText,
  isObject,
  type ApiSchema,
  type ShapeRef,
} from "./api-schema";

type ValueProps = {
  schema: ApiSchema;
  reference: ShapeRef;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  depth: number;
};

function Description({ content }: { content?: string }) {
  const value = descriptionText(content);
  if (!value) return null;
  return value.length > 240 ? (
    <details className="text-xs leading-5 text-muted-foreground">
      <summary className="cursor-pointer">{value.slice(0, 160)}…</summary>
      <p className="mt-2 whitespace-pre-wrap">{value}</p>
    </details>
  ) : (
    <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
      {value}
    </p>
  );
}

function JsonField({
  value,
  onChange,
  path,
}: Pick<ValueProps, "value" | "onChange" | "path">) {
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2) ?? "");
  const [error, setError] = useState("");
  const lastValue = useRef(JSON.stringify(value));
  useEffect(() => {
    const next = JSON.stringify(value);
    if (next !== lastValue.current) {
      setDraft(JSON.stringify(value, null, 2) ?? "");
      setError("");
      lastValue.current = next;
    }
  }, [value]);
  return (
    <div className="space-y-2">
      <Textarea
        aria-label={path}
        className="mono min-h-24"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          try {
            const parsed: unknown = JSON.parse(raw);
            lastValue.current = JSON.stringify(parsed);
            onChange(parsed);
            setError("");
          } catch {
            lastValue.current = JSON.stringify(raw);
            onChange(raw);
            setError(text("올바른 JSON을 입력하세요.", "Enter valid JSON."));
          }
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function MapFields(props: ValueProps) {
  const { schema, reference, value, onChange, path, depth } = props;
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const shape = schema.shapes[reference.shape];
  if (!isObject(value))
    return (
      <p className="text-sm text-destructive">
        {text(
          "JSON 모드에서 객체 형식을 확인하세요.",
          "Check the object type in JSON mode.",
        )}
      </p>
    );
  return (
    <div className="space-y-3">
      {Object.entries(value).map(([name, item]) => (
        <div key={name} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="break-all text-sm font-medium">{name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${path}.${name} ${text("제거", "Remove")}`}
              onClick={() => {
                const next = { ...value };
                delete next[name];
                onChange(next);
              }}
            >
              <X />
            </Button>
          </div>
          {shape.value && (
            <ValueInput
              {...props}
              reference={shape.value}
              path={`${path}.${name}`}
              depth={depth + 1}
              value={item}
              onChange={(next) => onChange({ ...value, [name]: next })}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          aria-label={`${path} ${text("새 키", "New key")}`}
          placeholder={text("새 키", "New key")}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!key || Object.hasOwn(value, key))
              return setError(
                text(
                  "비어 있지 않은 고유한 키를 입력하세요.",
                  "Enter a non-empty unique key.",
                ),
              );
            onChange({
              ...value,
              [key]: defaultShapeValue(
                shape.value && schema.shapes[shape.value.shape],
              ),
            });
            setKey("");
            setError("");
          }}
        >
          <Plus />
          {text("추가", "Add")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ValueInput(props: ValueProps) {
  const { schema, reference, value, onChange, path, depth } = props;
  const shape = schema.shapes[reference.shape];
  const id = useId();
  if (!shape || depth > 8)
    return <JsonField value={value} onChange={onChange} path={path} />;
  if (shape.type === "structure") {
    if (value !== undefined && !isObject(value))
      return (
        <p className="text-sm text-destructive">
          {text(
            "JSON 모드에서 객체 형식을 확인하세요.",
            "Check the object type in JSON mode.",
          )}
        </p>
      );
    const object = isObject(value) ? value : {};
    const members = Object.entries(shape.members ?? {}).sort(
      ([a], [b]) =>
        Number(shape.required?.includes(b) ?? false) -
        Number(shape.required?.includes(a) ?? false),
    );
    return (
      <div className="space-y-4">
        {!members.length && (
          <p className="text-sm text-muted-foreground">
            {text("입력 옵션이 없습니다.", "No input options.")}
          </p>
        )}
        {members.map(([name, ref]) => {
          const required = shape.required?.includes(name) ?? false;
          const included = Object.hasOwn(object, name);
          const child = schema.shapes[ref.shape];
          const childPath = path ? `${path}.${name}` : name;
          const change = (next: unknown) =>
            onChange({ ...object, [name]: next });
          return (
            <section
              key={name}
              className="space-y-3 rounded-lg border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                {!required && (
                  <Checkbox
                    aria-label={`${childPath} ${text("포함", "Include")}`}
                    checked={included}
                    onCheckedChange={(checked) => {
                      if (checked === true) change(defaultShapeValue(child));
                      else {
                        const next = { ...object };
                        delete next[name];
                        onChange(next);
                      }
                    }}
                  />
                )}
                <Label className="break-all font-semibold">{name}</Label>
                <Badge variant={required ? "default" : "outline"}>
                  {text(
                    required ? "필수" : "선택",
                    required ? "Required" : "Optional",
                  )}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {child?.type}
                </span>
                {(child?.min !== undefined || child?.max !== undefined) && (
                  <span className="text-xs text-muted-foreground">
                    {child.min ?? "−∞"} – {child.max ?? "∞"}
                  </span>
                )}
              </div>
              <Description
                content={ref.documentation ?? child?.documentation}
              />
              {(included || required) && (
                <ValueInput
                  schema={schema}
                  reference={ref}
                  value={object[name]}
                  onChange={change}
                  path={childPath}
                  depth={depth + 1}
                />
              )}
            </section>
          );
        })}
        {Object.keys(object).some(
          (name) => !Object.hasOwn(shape.members ?? {}, name),
        ) && (
          <p className="text-xs text-muted-foreground">
            {text(
              "추가 입력값이 보존되어 있습니다. JSON 모드에서 편집할 수 있습니다.",
              "Additional fields are preserved and can be edited in JSON mode.",
            )}
          </p>
        )}
      </div>
    );
  }
  if (shape.type === "list") {
    if (value !== undefined && !Array.isArray(value))
      return (
        <p className="text-sm text-destructive">
          {text(
            "JSON 모드에서 목록 형식을 확인하세요.",
            "Check the list type in JSON mode.",
          )}
        </p>
      );
    const items = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {shape.member && (
                <ValueInput
                  {...props}
                  reference={shape.member}
                  path={`${path}[${index}]`}
                  depth={depth + 1}
                  value={item}
                  onChange={(next) =>
                    onChange(items.map((v, i) => (i === index ? next : v)))
                  }
                />
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${path}[${index}] ${text("제거", "Remove")}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...items,
              defaultShapeValue(
                shape.member && schema.shapes[shape.member.shape],
              ),
            ])
          }
        >
          <Plus />
          {text("항목 추가", "Add item")}
        </Button>
      </div>
    );
  }
  if (shape.type === "map") return <MapFields {...props} value={value ?? {}} />;
  if (shape.type === "boolean" || shape.enum) {
    const choices = shape.type === "boolean" ? ["true", "false"] : shape.enum!;
    return (
      <SelectField
        id={id}
        aria-label={path}
        className="w-full"
        value={value === undefined ? "" : String(value)}
        placeholder={text("값 선택", "Choose a value")}
        required
        onValueChange={(next) =>
          onChange(shape.type === "boolean" ? next === "true" : next)
        }
      >
        {choices.map((choice) => (
          <SelectOption key={choice} value={choice}>
            {choice}
          </SelectOption>
        ))}
      </SelectField>
    );
  }
  if (
    ["string", "timestamp", "integer", "long", "float", "double"].includes(
      shape.type,
    )
  ) {
    const numeric = ["integer", "long", "float", "double"].includes(shape.type);
    return (
      <Input
        id={id}
        aria-label={path}
        autoComplete="off"
        type={shape.sensitive ? "password" : numeric ? "number" : "text"}
        step={["integer", "long"].includes(shape.type) ? "1" : "any"}
        value={
          value === undefined
            ? ""
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value)
        }
        placeholder={
          shape.type === "timestamp" ? "2026-01-01T00:00:00Z" : undefined
        }
        onChange={(e) => {
          const raw = e.target.value;
          onChange(
            numeric && raw.trim() !== "" && Number.isFinite(Number(raw))
              ? Number(raw)
              : raw,
          );
        }}
      />
    );
  }
  return <JsonField value={value} onChange={onChange} path={path} />;
}

export function ApiInputForm({
  schema,
  value,
  onChange,
  disabled,
}: {
  schema: ApiSchema;
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <Description content={schema.documentation} />
      <ValueInput
        schema={schema}
        reference={{ shape: schema.root }}
        value={value}
        onChange={onChange}
        path=""
        depth={0}
      />
    </fieldset>
  );
}
