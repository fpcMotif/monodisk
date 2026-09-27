declare function mdTerminal(enable: number): void;
declare function mdDimension(axis: number): number;
declare function mdKey(timeout: number): number;
export function terminal(enable: boolean): void {
  mdTerminal(enable ? 1 : 0);
}
export function dimension(axis: number): number {
  return mdDimension(axis);
}
export function key(timeout: number): number {
  return mdKey(timeout);
}
