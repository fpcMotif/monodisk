export type Entry = {
  id: number;
  name: string;
  allocated: number;
  logical: number;
  files: number;
  directory: boolean;
  complete: boolean;
};

declare function mdStart(path: string, threads: number): number;
declare function mdStatus(field: number): number;
declare function mdStop(): void;
declare function mdWait(): void;
declare function mdChildren(
  id: number,
  row: (
    id: number,
    name: string,
    allocated: number,
    logical: number,
    files: number,
    directory: number,
    complete: number,
  ) => void,
): void;
declare function mdParent(id: number): number;
declare function mdTrash(id: number): number;

export function start(path: string, threads: number): number {
  return mdStart(path, threads);
}
export function status(field: number): number {
  return mdStatus(field);
}
export function stop(): void {
  mdStop();
}
export function wait(): void {
  mdWait();
}
export function parent(id: number): number {
  return mdParent(id);
}
export function trash(id: number): number {
  return mdTrash(id);
}
export function children(parentId: number): Entry[] {
  const result: Entry[] = [];
  mdChildren(parentId, (id, name, allocated, logical, files, directory, complete) => {
    result.push({
      id,
      name,
      allocated,
      logical,
      files,
      directory: directory === 1,
      complete: complete === 1,
    });
  });
  return result;
}
