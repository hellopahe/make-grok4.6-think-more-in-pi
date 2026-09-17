import path from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { NAME, registerPolicy } from "./src/policy.mjs";

export default function makeGrokThinkMore(pi: ExtensionAPI) {
  registerPolicy(pi, path.join(getAgentDir(), `${NAME}.json`));
}
