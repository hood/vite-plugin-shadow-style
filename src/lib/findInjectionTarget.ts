import type { OutputAsset, OutputBundle, OutputChunk } from "rollup";

import { PluginError } from "./pluginError";

function isInjectionTarget(
  outputFile: OutputAsset | OutputChunk
): outputFile is OutputChunk {
  return (
    "isEntry" in outputFile && !!outputFile.isEntry && "code" in outputFile
  );
}

/**
 * Scans the output bundle for a JS file flagged as entry point. If more than
 * one JS file is found, an error is thrown.
 *
 * @param outputBundle {OutputBundle} - The output bundle to scan for a CSS file.
 * @returns {OutputChunk} - The JS file found in the output bundle.
 * @throws {PluginError} - Throws an error if more no entry point JS file is
 *   found in the output bundle.
 */
export function findInjectionTarget(outputBundle: OutputBundle): OutputChunk {
  const injectionTarget = Object.values(outputBundle).find(isInjectionTarget);

  if (!injectionTarget) throw new PluginError("Injection target not found!");

  return injectionTarget;
}
