import type { Plugin } from "vite";
import type { OutputAsset, OutputChunk } from "rollup";

type PluginConfig = {};

const PLUGIN_NAME = "vite-plugin-shadow-style";

export default (pluginConfig: PluginConfig = {}): Plugin => {
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
          throw new Error(
            `[${PLUGIN_NAME}] 'build.cssCodeSplit' option is set to true, it must be false.`
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
        throw new Error(`[${PLUGIN_NAME}] Injection candidate not found!`);

      if (!injectionTargetName || !outputBundle[injectionTargetName])
        throw new Error(`[${PLUGIN_NAME}] Injection target not found!`);

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
};
