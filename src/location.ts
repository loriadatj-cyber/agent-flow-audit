import type { Location } from "./types.js";

export function locate(path: string, source: string, needle: string): Location {
  return locateFromOffset(path, source, needle, 0);
}

export function locateAfter(
  path: string,
  source: string,
  needle: string,
  anchor: Location,
): Location {
  const lines = source.split(/\r?\n/u);
  const offset = lines
    .slice(0, Math.max(0, anchor.line - 1))
    .reduce((total, line) => total + line.length + 1, 0);
  return locateFromOffset(path, source, needle, offset);
}

function locateFromOffset(
  path: string,
  source: string,
  needle: string,
  offset: number,
): Location {
  let index = source.indexOf(needle, offset);
  if (index < 0 && offset > 0) {
    index = source.indexOf(needle);
  }
  if (index < 0) {
    return { path, line: 1, column: 1 };
  }

  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/u);
  return {
    path,
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

export function locationKey(location: Location): string {
  return `${location.path}:${location.line}:${location.column}`;
}
