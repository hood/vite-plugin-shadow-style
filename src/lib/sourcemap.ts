import type { Rollup } from "vite" with { "resolution-mode": "import" };

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_INDEX = new Map([...BASE64].map((char, index) => [char, index]));

const SOURCEMAP_COMMENT = /\n\/\/# sourceMappingURL=([^\n]*)\n?$/;
const INLINE_MAP_PREFIX = "data:application/json;charset=utf-8;base64,";

export type ColumnShift = {
  /** 0-based generated line. */
  line: number;
  /** Generated column where the replaced text ended, before the edit. */
  end: number;
  /** How many characters the edit added (or removed, if negative). */
  delta: number;
};

/** Decodes the first VLQ value of a segment, returning it with its length. */
function decodeFirst(segment: string): [number, number] {
  let result = 0;
  let shift = 0;
  let index = 0;

  for (;;) {
    const digit = BASE64_INDEX.get(segment[index++] ?? "");
    if (digit === undefined)
      throw new Error(`Invalid sourcemap segment "${segment}"`);
    result += (digit & 31) * 2 ** shift;
    if (!(digit & 32)) break;
    shift += 5;
  }

  const value = Math.floor(result / 2);
  return [result % 2 ? -value : value, index];
}

function encode(value: number): string {
  let vlq = value < 0 ? -value * 2 + 1 : value * 2;
  let out = "";

  do {
    let digit = vlq % 32;
    vlq = Math.floor(vlq / 32);
    if (vlq > 0) digit |= 32;
    out += BASE64[digit];
  } while (vlq > 0);

  return out;
}

/**
 * Moves the generated columns of every mapping found after an edited range.
 * Generated columns are relative within a line, so only the first value of
 * each segment on an edited line needs to be re-encoded.
 */
export function shiftColumns(mappings: string, shifts: ColumnShift[]): string {
  const lines = mappings.split(";");

  for (const line of new Set(shifts.map(shift => shift.line))) {
    if (!lines[line]) continue;

    const lineShifts = shifts.filter(shift => shift.line === line);
    let previousOriginal = 0;
    let previousShifted = 0;

    lines[line] = lines[line]!.split(",")
      .map(segment => {
        const [relative, length] = decodeFirst(segment);
        const original = previousOriginal + relative;
        const shifted = lineShifts.reduce(
          (column, shift) =>
            shift.end <= original ? column + shift.delta : column,
          original
        );
        const out = encode(shifted - previousShifted) + segment.slice(length);

        previousOriginal = original;
        previousShifted = shifted;
        return out;
      })
      .join(",");
  }

  return lines.join(";");
}

/** Splits a trailing `//# sourceMappingURL=` comment off the chunk code. */
export function splitSourcemapComment(code: string): [string, string] {
  const match = code.match(SOURCEMAP_COMMENT);
  return match ? [code.slice(0, match.index), match[0]] : [code, ""];
}

/**
 * Applies `update` to the chunk sourcemap, wherever Rollup keeps a copy of it:
 * the chunk itself, the emitted `.map` asset and the inline comment.
 */
export function updateSourcemap(
  chunk: Rollup.OutputChunk,
  bundle: Rollup.OutputBundle,
  update: (mappings: string) => string
): void {
  const mappings = (previous: string) =>
    chunk.map ? chunk.map.mappings : update(previous);

  if (chunk.map) chunk.map.mappings = update(chunk.map.mappings);

  const mapFileName =
    (chunk as { sourcemapFileName?: string | null }).sourcemapFileName ??
    `${chunk.fileName}.map`;
  const mapAsset = bundle[mapFileName];

  if (mapAsset?.type === "asset") {
    const map = JSON.parse(String(mapAsset.source));
    map.mappings = mappings(map.mappings);
    mapAsset.source = JSON.stringify(map);
  }

  const [code, comment] = splitSourcemapComment(chunk.code);
  const url = comment.match(SOURCEMAP_COMMENT)?.[1];

  if (url?.startsWith(INLINE_MAP_PREFIX)) {
    const map = JSON.parse(
      Buffer.from(url.slice(INLINE_MAP_PREFIX.length), "base64").toString()
    );
    map.mappings = mappings(map.mappings);
    chunk.code = `${code}\n//# sourceMappingURL=${INLINE_MAP_PREFIX}${Buffer.from(
      JSON.stringify(map)
    ).toString("base64")}`;
  }
}
