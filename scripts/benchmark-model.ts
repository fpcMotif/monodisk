export type Result = {
  seconds: number;
  entries: number;
  allocated: number;
  files: number;
  errors: number;
};
function field(value: object, name: string): number | undefined {
  const item: unknown = Reflect.get(value, name);
  return typeof item === "number" && Number.isFinite(item) && item >= 0 ? item : undefined;
}
function required(value: object, name: string): number {
  const result = field(value, name);
  if (result === undefined) throw new Error("Missing or invalid benchmark field: " + name);
  return result;
}
export function decode(text: string): Result {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null) throw new Error("Invalid benchmark output");
  const files = required(value, "files");
  return {
    seconds: required(value, "seconds"),
    files,
    errors: required(value, "errors"),
    allocated: field(value, "allocated") ?? required(value, "bytes"),
    entries: field(value, "entries") ?? files + required(value, "dirs") + 1,
  };
}
export function matches(result: Result, expected: Result): boolean {
  return (
    result.files === expected.files &&
    result.allocated === expected.allocated &&
    result.entries === expected.entries &&
    result.errors === 0
  );
}
export function median(values: number[]): number {
  if (values.length === 0 || values.length % 2 === 0)
    throw new Error("Median requires an odd nonempty sample");
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
}
