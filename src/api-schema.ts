import { text } from "./app-model";

export type ShapeRef = { shape: string; documentation?: string };
export type ApiShape = {
  type: string;
  documentation?: string;
  enum?: string[];
  min?: number;
  max?: number;
  sensitive?: boolean;
  required?: string[];
  members?: Record<string, ShapeRef>;
  member?: ShapeRef;
  key?: ShapeRef;
  value?: ShapeRef;
};
export type ApiSchema = {
  root: string;
  shapes: Record<string, ApiShape>;
  documentation?: string;
};
export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseApiInput(input: string): Record<string, unknown> {
  const value: unknown = JSON.parse(input);
  if (!isObject(value))
    throw Error(
      text("JSON 객체를 입력하세요.", "Input must be a JSON object."),
    );
  return value;
}

export function descriptionText(html?: string) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(
    html.replace(/<\/(p|li|note|important)>/gi, "</$1>\n"),
    "text/html",
  );
  doc.querySelectorAll("script,style").forEach((node) => node.remove());
  return (doc.body.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

export function defaultShapeValue(shape?: ApiShape): unknown {
  if (shape?.type === "structure" || shape?.type === "map") return {};
  if (shape?.type === "list") return [];
  // Do not silently choose false, zero or the first enum for a user.
  return "";
}

/** Validate modeled values without removing unknown fields supplied in JSON mode. */
export function validateApiInput(schema: ApiSchema, input: unknown): string[] {
  const errors: string[] = [];
  function walk(ref: string, value: unknown, path: string, depth: number) {
    if (errors.length >= 30) return;
    const s = schema.shapes[ref];
    if (!s) return;
    if (depth > 64) {
      errors.push(
        `${path}: ${text("중첩이 너무 깊습니다.", "Nesting is too deep.")}`,
      );
      return;
    }
    const invalid = (message: string) =>
      errors.push(`${path || "Input"}: ${message}`);
    if (s.type === "structure") {
      if (!isObject(value))
        return invalid(text("객체를 입력하세요.", "Expected an object."));
      for (const name of s.required ?? []) {
        if (
          !Object.hasOwn(value, name) ||
          value[name] === undefined ||
          value[name] === ""
        ) {
          errors.push(
            `${path ? path + "." : ""}${name}: ${text("필수값입니다.", "Required.")}`,
          );
        }
      }
      for (const [name, child] of Object.entries(s.members ?? {})) {
        if (Object.hasOwn(value, name))
          walk(
            child.shape,
            value[name],
            path ? `${path}.${name}` : name,
            depth + 1,
          );
      }
    } else if (s.type === "list") {
      if (!Array.isArray(value))
        return invalid(text("목록을 입력하세요.", "Expected a list."));
      checkLength(value.length, s, invalid);
      value.forEach(
        (item, i) =>
          s.member && walk(s.member.shape, item, `${path}[${i}]`, depth + 1),
      );
    } else if (s.type === "map") {
      if (!isObject(value))
        return invalid(
          text("키와 값의 객체를 입력하세요.", "Expected a key/value object."),
        );
      checkLength(Object.keys(value).length, s, invalid);
      Object.entries(value).forEach(([key, item]) => {
        if (s.key) walk(s.key.shape, key, `${path}[${key}] key`, depth + 1);
        if (s.value) walk(s.value.shape, item, `${path}[${key}]`, depth + 1);
      });
    } else if (["integer", "long", "float", "double"].includes(s.type)) {
      if (typeof value !== "number" || !Number.isFinite(value))
        return invalid(text("숫자를 입력하세요.", "Expected a number."));
      if (["integer", "long"].includes(s.type) && !Number.isSafeInteger(value))
        return invalid(
          text(
            "정확하게 표현 가능한 정수를 입력하세요.",
            "Expected a safe integer.",
          ),
        );
      if (s.min !== undefined && value < s.min)
        invalid(`${text("최솟값", "Minimum")}: ${s.min}`);
      if (s.max !== undefined && value > s.max)
        invalid(`${text("최댓값", "Maximum")}: ${s.max}`);
    } else if (s.type === "boolean") {
      if (typeof value !== "boolean")
        invalid(text("참 또는 거짓을 선택하세요.", "Choose true or false."));
    } else if (s.type === "timestamp") {
      if (
        !(typeof value === "number" && Number.isFinite(value)) &&
        !(
          typeof value === "string" &&
          value.trim() &&
          !Number.isNaN(Date.parse(value))
        )
      )
        invalid(
          text("유효한 날짜/시간을 입력하세요.", "Enter a valid timestamp."),
        );
    } else if (s.type === "string") {
      if (typeof value !== "string")
        return invalid(text("문자열을 입력하세요.", "Expected a string."));
      checkLength([...value].length, s, invalid);
      if (s.enum && !s.enum.includes(value))
        invalid(text("허용된 값 중 선택하세요.", "Choose an allowed value."));
    }
  }
  walk(schema.root, input, "", 0);
  return errors;
}

function checkLength(
  length: number,
  shape: ApiShape,
  invalid: (message: string) => void,
) {
  if (shape.min !== undefined && length < shape.min)
    invalid(`${text("최소 길이", "Minimum length")}: ${shape.min}`);
  if (shape.max !== undefined && length > shape.max)
    invalid(`${text("최대 길이", "Maximum length")}: ${shape.max}`);
}
