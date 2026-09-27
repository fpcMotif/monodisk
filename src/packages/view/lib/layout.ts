export type Tile = { id: number; x: number; y: number; width: number; height: number };
export type Weight = { id: number; allocated: number };

export function partition(
  items: Weight[],
  x: number,
  y: number,
  width: number,
  height: number,
): Tile[] {
  if (items.length === 0 || width < 1 || height < 1) return [];
  if (items.length === 1) return [{ id: items[0].id, x, y, width, height }];
  let total = 0;
  for (const item of items) total += item.allocated;
  if (total <= 0) return [];
  let split = 1;
  let left = items[0].allocated;
  while (split < items.length - 1 && left + items[split].allocated / 2 < total / 2) {
    left += items[split].allocated;
    split++;
  }
  const horizontal = width >= height * 2;
  const span = horizontal ? width : height;
  if (span <= 1) return [{ id: items[0].id, x, y, width, height }];
  const size = Math.max(1, Math.min(span - 1, Math.round((span * left) / total)));
  const a = partition(
    items.slice(0, split),
    x,
    y,
    horizontal ? size : width,
    horizontal ? height : size,
  );
  const b = partition(
    items.slice(split),
    horizontal ? x + size : x,
    horizontal ? y : y + size,
    horizontal ? width - size : width,
    horizontal ? height : height - size,
  );
  return a.concat(b);
}
