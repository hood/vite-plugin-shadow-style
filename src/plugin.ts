import type { OutputAsset, OutputBundle, OutputChunk } from "rollup";
import type { Plugin } from "vite";

import { PLUGIN_NAME } from "./lib/constants";
import { PluginError } from "./lib/pluginError";
import { checkCSSOutput } from "./lib/checkCSSOutput";
import { findInjectionCandidate } from "./lib/findInjectionCandidate";
import { findInjectionTarget } from "./lib/findInjectionTarget";

type PluginConfig = {};

export function shadowStyle(pluginConfig: PluginConfig = {}): Plugin {
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
      checkCSSOutput(outputBundle as OutputBundle);

      const injectionCandidate = findInjectionCandidate(
        outputBundle as OutputBundle
      );

      const injectionTarget = findInjectionTarget(outputBundle as OutputBundle);

      injectionTarget.code = injectionTarget.code.replace(
        "SHADOW_STYLE",
        `\`${injectionCandidate.source}\``
      );

      return;
    }
  };
}
