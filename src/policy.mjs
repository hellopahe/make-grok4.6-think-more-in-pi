import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const NAME = "make-grok4.6-think-more-in-pi";
export const START = `<!-- ${NAME}:begin -->`;
export const END = `<!-- ${NAME}:end -->`;

export const POLICY = `${START}
Requirement coverage and evidence

- Keep every explicit requirement of the request in view until it is completed, superseded by the user, or genuinely blocked. If something is blocked, say so plainly rather than quietly dropping it.
- Claim that work is done, fixed, tested, or verified only when the evidence supports that claim. For actions you perform, use observed tool results. When analyzing supplied records or code, identify that basis and distinguish it from checks you personally executed. State what remains unverified and why.
${END}`;

export function isEligible(model, thinkingLevel) {
  return model?.provider === "xai" && model?.id === "grok-4.6" && thinkingLevel === "xhigh";
}

export function stripPolicy(prompt) {
  let result = prompt;
  let cursor = 0;
  while (true) {
    const start = result.indexOf(START, cursor);
    if (start < 0) return result;
    const end = result.indexOf(END, start + START.length);
    if (end < 0) return result;
    const nestedStart = result.indexOf(START, start + START.length);
    if (nestedStart >= 0 && nestedStart < end) {
      // Preserve an unmatched marker in existing instructions.
      cursor = nestedStart;
      continue;
    }
    const from = start >= 2 && result.slice(start - 2, start) === "\n\n" ? start - 2 : start;
    result = result.slice(0, from) + result.slice(end + END.length);
    cursor = from;
  }
}

export function applyPolicy(prompt, active) {
  const base = stripPolicy(prompt);
  return active ? `${base}\n\n${POLICY}` : base;
}

export function readState(statePath) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (typeof state?.enabled !== "boolean") throw new Error("expected a boolean enabled field");
    return { enabled: state.enabled };
  } catch (error) {
    if (error?.code === "ENOENT") return { enabled: true };
    return { enabled: false, error: `Cannot read policy state (${error?.code ?? error?.message ?? "unknown error"}). Policy is disabled; use /${NAME} on or off to repair it.` };
  }
}

export function writeState(statePath, enabled) {
  if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean");
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  const temporary = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, enabled }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, statePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Register through Pi's supported extension API; state changes apply at the next user prompt. */
export function registerPolicy(pi, statePath) {
  let lastReportedError;
  const stateFor = (ctx) => {
    const state = readState(statePath);
    if (state.error && state.error !== lastReportedError) ctx.ui.notify(state.error, "warning");
    lastReportedError = state.error;
    return state;
  };
  const eligibleFor = (ctx) => isEligible(ctx.model, pi.getThinkingLevel());

  pi.registerCommand(NAME, {
    description: "Grok 4.6 xhigh prompt policy: on | off | status (changes apply next prompt)",
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase() || "status";
      if (!["on", "off", "status"].includes(arg)) {
        ctx.ui.notify(`Use /${NAME} on, off, or status.`, "warning");
        return;
      }
      if (arg !== "status") {
        try {
          writeState(statePath, arg === "on");
        } catch (error) {
          ctx.ui.notify(`Could not save policy state: ${error?.message ?? error}`, "error");
          return;
        }
      }
      const state = stateFor(ctx);
      const current = ctx.model ? `${ctx.model.provider}/${ctx.model.id} · ${pi.getThinkingLevel()}` : "no model selected";
      const active = state.enabled && eligibleFor(ctx);
      ctx.ui.notify(`${NAME}: ${state.enabled ? "on" : "off"}. Next prompt: ${active ? "active" : "inactive"}. Current: ${current}.`, "info");
    },
  });

  pi.on("before_agent_start", (event, ctx) => {
    const active = stateFor(ctx).enabled && eligibleFor(ctx);
    const systemPrompt = applyPolicy(event.systemPrompt, active);
    if (systemPrompt !== event.systemPrompt) return { systemPrompt };
    return undefined;
  });
}
