export function summarize(values: number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0)
      throw new Error("Sizes must be finite and nonnegative");
    total += value;
  }
  return total;
}
