import { summarize } from "./lib/impl";
export function totalSize(values: number[]): number {
  return summarize(values);
}
