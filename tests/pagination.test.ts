// @vitest-environment jsdom
import { expect, test } from "vitest";
import { mergeRows } from "../src/pagination";
test("overlapping pages update existing resources without duplicating them", () => {
  expect(
    mergeRows(
      [{ id: "a", value: 1 }],
      [
        { id: "a", value: 2 },
        { id: "b", value: 3 },
      ],
      (r) => r.id,
    ),
  ).toEqual([
    { id: "a", value: 2 },
    { id: "b", value: 3 },
  ]);
});
test("oversized pages fail without mutating the already displayed rows", () => {
  const previous = [{ id: "old" }];
  expect(() =>
    mergeRows(
      previous,
      Array.from({ length: 5000 }, (_, i) => ({ id: String(i) })),
      (r) => r.id,
    ),
  ).toThrow();
  expect(previous).toEqual([{ id: "old" }]);
  expect(() =>
    mergeRows(
      [],
      [{ id: "large", message: "x".repeat(8 * 1024 * 1024) }],
      (r) => r.id,
    ),
  ).toThrow();
});
