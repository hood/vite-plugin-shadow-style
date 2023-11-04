import type { OutputAsset, OutputBundle, OutputChunk } from "rollup";
import type { Plugin } from "vite";

import { PLUGIN_NAME } from "./lib/constants";
import { PluginError } from "./lib/pluginError";
import { checkCSSOutput } from "./lib/checkCSSOutput";

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

    async generateBundle(normalizedOutputOptions, outputBundle, isWrite) {
      const injectionCandidateName = Object.keys(outputBundle).find(
        key =>
          outputBundle[key]?.name?.includes(".css") &&
          "source" in outputBundle[key]
      );

      const injectionTargetName = Object.keys(outputBundle).find(
        key =>
          "isEntry" in outputBundle[key] &&
          "code" in outputBundle[key] &&
          Object.getOwnPropertyDescriptor(outputBundle[key], "isEntry")?.value
      );

      if (!injectionCandidateName || !outputBundle[injectionCandidateName])
        throw new PluginError("Injection candidate not found!");

      // NOTE: This is a workaround for a wrongfully reported type mismatch.
      checkCSSOutput(outputBundle as OutputBundle);

      if (!injectionTargetName || !outputBundle[injectionTargetName])
        throw new PluginError("Injection target not found!");

      const injectionCandidate = outputBundle[
        injectionCandidateName
      ] as OutputAsset;

      const injectionTarget = outputBundle[injectionTargetName] as OutputChunk;

      injectionTarget.code = injectionTarget.code.replace(
        "SHADOW_STYLE",
        `\`${injectionCandidate.source}\``
      );

      return;
    }
  };
}
