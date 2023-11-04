import { PLUGIN_NAME } from "./constants";

export class PluginError extends Error {
  constructor(message: Error["message"]) {
    super(message);

    this.name = PLUGIN_NAME.concat(" error");
  }
}
