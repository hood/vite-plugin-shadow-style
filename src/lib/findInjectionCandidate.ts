import type { OutputAsset, OutputBundle, OutputChunk } from "rollup";

import { PluginError } from "./pluginError";

function isInjectionCandidate(
  outputFile: OutputAsset | OutputChunk
): outputFile is OutputAsset {
  return !!outputFile.name?.includes(".css") && "source" in outputFile;
}

/**
 * Scans the output bundle for a CSS file. If no CSS file is found, an error is
 * thrown.
 *
 * @param outputBundle {OutputBundle} - The output bundle to scan for a CSS file.
 * @returns {OutputAsset} - The CSS file found in the output bundle.
 * @throws {PluginError} - Throws an error if no CSS file is found in the output
 *   bundle.
 */
export function findInjectionCandidate(
  outputBundle: OutputBundle
): OutputAsset {
  const injectionCandidate =
    Object.values(outputBundle).find(isInjectionCandidate);

  if (!injectionCandidate)
    throw new PluginError("Injection candidate not found!");

  return injectionCandidate;
}
