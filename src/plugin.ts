import type { Plugin, Rollup } from "vite";

import { PLACEHOLDER, PLUGIN_NAME } from "./lib/constants";
import { PluginError } from "./lib/pluginError";
import {
  type AstNode,
  type Placeholder,
  findPlaceholders
} from "./lib/findPlaceholders";
import {
  type ColumnShift,
  shiftColumns,
  splitSourcemapComment,
  updateSourcemap
} from "./lib/sourcemap";

export type PluginConfig = {
  /**
   * Wrap the entry chunks in an IIFE. This is needed in order to avoid issues
   * with classnames used across different webcomponents in the same page, which
   * get translated to constants with the same identifier at the global scope,
   * causing conflicts. ES module chunks with imports or exports can't be
   * wrapped: use `build.lib.formats: ["iife"]` for those.
   */
  iife?: boolean;
  /**
   * Transform the output css content. This can be required as it is possible that packages
   * which generate css include extra characters or metadata that is not desired.
   */
  transformOutput?: (out: string) => string;
};

type Context = Rollup.PluginContext;

function lineStarts(code: string): number[] {
  const starts = [0];
  for (let index = 0; index < code.length; index++)
    if (code[index] === "\n") starts.push(index + 1);
  return starts;
}

function lineOf(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

function readCss(asset: Rollup.OutputAsset): string {
  return typeof asset.source === "string"
    ? asset.source
    : new TextDecoder().decode(asset.source);
}

function inject(
  chunk: Rollup.OutputChunk,
  placeholders: Placeholder[],
  bundle: Rollup.OutputBundle,
  literal: string
): void {
  const starts = lineStarts(chunk.code);
  const shifts: ColumnShift[] = [];
  let code = "";
  let last = 0;

  for (const { start, end, shorthand } of placeholders) {
    const text = shorthand ? `${PLACEHOLDER}: ${literal}` : literal;
    const line = lineOf(starts, start);

    code += chunk.code.slice(last, start) + text;
    last = end;
    shifts.push({
      line,
      end: end - starts[line]!,
      delta: text.length - (end - start)
    });
  }

  chunk.code = code + chunk.code.slice(last);
  updateSourcemap(chunk, bundle, mappings => shiftColumns(mappings, shifts));
}

function wrapInIife(
  context: Context,
  chunk: Rollup.OutputChunk,
  bundle: Rollup.OutputBundle,
  format: Rollup.ModuleFormat
): void {
  if (format === "es" && (chunk.imports.length || chunk.exports.length))
    context.error(
      `Can't wrap "${chunk.fileName}" in an IIFE since it's an ES module with imports or exports. Drop the 'iife' option and use 'build.lib.formats: ["iife"]' instead.`
    );

  const [code, comment] = splitSourcemapComment(chunk.code);

  chunk.code = `(() => {\n${code}\n})();${comment}`;
  updateSourcemap(chunk, bundle, mappings => `;${mappings}`);
}

export function shadowStyle(pluginConfig: PluginConfig = {}): Plugin {
  const transformOutput =
    pluginConfig.transformOutput ?? ((out: string) => out);

  return {
    name: PLUGIN_NAME,
    enforce: "post",

    buildStart() {
      this.info({ message: "plugin registered" });
    },

    config(userConfig, env) {
      if (env.command !== "build") return;

      if (userConfig.build?.cssCodeSplit)
        throw new PluginError(
          `'build.cssCodeSplit' option is set to true, it must be false.`
        );

      return { build: { cssCodeSplit: false } };
    },

    generateBundle: {
      order: "post",
      handler(outputOptions, bundle) {
        const files = Object.values(bundle);
        const chunks = files.filter(
          (file): file is Rollup.OutputChunk => file.type === "chunk"
        );
        const targets = chunks
          .filter(chunk => chunk.code.includes(PLACEHOLDER))
          .map(chunk => ({
            chunk,
            placeholders: findPlaceholders(
              this.parse(chunk.code) as unknown as AstNode
            )
          }))
          .filter(target => target.placeholders.length);

        if (targets.length) {
          const cssAssets = files.filter(
            (file): file is Rollup.OutputAsset =>
              file.type === "asset" && file.fileName.endsWith(".css")
          );

          if (cssAssets.length > 1)
            this.error(
              `Found ${cssAssets.length} CSS files (${cssAssets
                .map(asset => asset.fileName)
                .join(
                  ", "
                )}), only a single one is supported. Set 'build.cssCodeSplit' to false.`
            );

          if (!cssAssets.length)
            this.warn(
              `No CSS found in the output bundle, ${PLACEHOLDER} will be an empty string.`
            );

          const literal = JSON.stringify(
            transformOutput(cssAssets[0] ? readCss(cssAssets[0]) : "")
          );

          for (const { chunk, placeholders } of targets)
            inject(chunk, placeholders, bundle, literal);
        } else {
          this.warn(`No ${PLACEHOLDER} reference found, nothing to inject.`);
        }

        if (pluginConfig.iife)
          for (const chunk of chunks.filter(chunk => chunk.isEntry))
            wrapInIife(this, chunk, bundle, outputOptions.format);
      }
    }
  };
}
