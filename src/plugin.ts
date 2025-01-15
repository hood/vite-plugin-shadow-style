import type { OutputAsset, OutputBundle, OutputChunk } from "rollup";
import type { Plugin } from "vite";

import { PLUGIN_NAME } from "./lib/constants";
import { PluginError } from "./lib/pluginError";
import { checkCSSOutput } from "./lib/checkCSSOutput";
import { findInjectionCandidate } from "./lib/findInjectionCandidate";
import { findInjectionTarget } from "./lib/findInjectionTarget";

type PluginConfig = {
  /**
   * Wrap the output bundle in an IIFE. This is needed in order to avoid issues
   * with classnames used across different webcomponents in the same page, which
   * get translated to constants with the same identifier at the global scope,
   * causing conflicts.
   */
  iife?: boolean;
};

export function shadowStyle(
  pluginConfig: PluginConfig = { iife: false }
): Plugin {
  return {
    name: PLUGIN_NAME,

    buildStart() {
      this.info({ message: "plugin registered" });
    },

    config(userConfig, env) {
      if (env.command === "build") {
        if (!userConfig.build) {
          userConfig.build = {};
        }

        if (userConfig.build.cssCodeSplit) {
          throw new PluginError(
            `'build.cssCodeSplit' option is set to true, it must be false.`
          );
        }
      }
    },

    // NOTE: The outputBundle casting is a workaround for a wrongfully reported
    // type mismatch.
    async generateBundle(normalizedOutputOptions, outputBundle, isWrite) {
      try {
        checkCSSOutput(outputBundle as OutputBundle);

        const injectionCandidate = findInjectionCandidate(
          outputBundle as OutputBundle
        );

        const injectionTarget = findInjectionTarget(
          outputBundle as OutputBundle
        );

        const escapedStyles = injectionCandidate.source.replace(/`/g, "\\`");

        // Swap the style placeholder with the style to inject.
        injectionTarget.code = injectionTarget.code.replace(
          "SHADOW_STYLE",
          `\`${escapedStyles}\``
        );

        if (pluginConfig.iife)
          injectionTarget.code = `(() => {${injectionTarget.code}})();`;
      } catch (error) {
        this.warn((error as PluginError).message);
      } finally {
        return;
      }
    }
  };
}
