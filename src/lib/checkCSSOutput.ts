import type { OutputBundle } from "rollup";

import { PluginError } from "./pluginError";

/**
 * Checks the output bundle for CSS files. If more than one CSS file is found,
 * an error is thrown.
 *
 * @param outputBundle {OutputBundle} - The output bundle to check for CSS files.
 * @throws {PluginError} - Throws an error if more than one CSS file is found in
 *   the output bundle.
 */
export function checkCSSOutput(outputBundle: OutputBundle): void {
  if (
    Object.values(outputBundle).filter(({ fileName }) =>
      fileName.endsWith(".css")
    ).length > 1
  )
    throw new PluginError(
      "Multiple CSS files found in the output bundle. This plugin currently only supports handling a single css output."
    );
}
