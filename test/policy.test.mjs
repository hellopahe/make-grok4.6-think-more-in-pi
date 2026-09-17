import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NAME, START, END, POLICY, isEligible, applyPolicy, readState, writeState, registerPolicy } from "../src/policy.mjs";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grok-policy-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "agent", `${NAME}.json`);
}

function harness(statePath) {
  const handlers = new Map();
  const commands = new Map();
  const notifications = [];
  let level = "xhigh";
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, handler) => commands.set(name, handler),
    getThinkingLevel: () => level,
  };
  const ctx = { model: { provider: "xai", id: "grok-4.6" }, ui: { notify: (...args) => notifications.push(args) } };
  registerPolicy(pi, statePath);
  return { handlers, commands, ctx, notifications, setLevel: (next) => { level = next; } };
}

test("eligibility is exact: provider, model, and effective thinking level", () => {
  const grok = { provider: "xai", id: "grok-4.6" };
  assert.equal(isEligible(grok, "xhigh"), true);
  for (const level of ["off", "low", "medium", "high", "max", undefined]) assert.equal(isEligible(grok, level), false);
  for (const model of [undefined, { provider: "openrouter", id: "grok-4.6" }, { provider: "xai", id: "grok-4.6-build" }, { provider: "xai", id: "grok-4.6-other" }, { provider: "xai", id: "grok-4.5" }]) assert.equal(isEligible(model, "xhigh"), false);
});

test("append is idempotent and preserves existing prompt bytes on removal", () => {
  const base = "Base prompt\n\nProject instructions\n\n<!-- another-extension -->\n";
  const once = applyPolicy(base, true);
  assert.equal(once, `${base}\n\n${POLICY}`);
  assert.equal(applyPolicy(once, true), once);
  assert.equal(applyPolicy(once, false), base);
  assert.equal(applyPolicy(base, false), base);
  assert.equal(applyPolicy(`${once}\n\n${POLICY}`, true), once);
});

test("policy removal preserves rules appended by later extensions", () => {
  const base = "base";
  const suffix = "\n\nOTHER RULE: preserve me";
  assert.equal(applyPolicy(applyPolicy(base, true) + suffix, false), base + suffix);
  assert.equal(applyPolicy(`base\n${START}\nincomplete marker`, false), `base\n${START}\nincomplete marker`);
  assert.equal(applyPolicy(`before${START}old rule${END}after`, false), "beforeafter");
});

test("an unmatched marker in the base prompt cannot consume later instructions", () => {
  const base = `Base\n${START}\nKeep this project instruction verbatim.`;
  const enabled = applyPolicy(base, true);
  assert.equal(enabled, `${base}\n\n${POLICY}`);
  assert.equal(applyPolicy(enabled, true), enabled);
  assert.equal(applyPolicy(enabled, false), base);
});

test("missing state is enabled without creating a file; writes persist atomically", (t) => {
  const file = fixture(t);
  assert.deepEqual(readState(file), { enabled: true });
  assert.equal(fs.existsSync(file), false);
  writeState(file, false);
  assert.deepEqual(readState(file), { enabled: false });
  writeState(file, true);
  assert.deepEqual(readState(file), { enabled: true });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [`${NAME}.json`]);
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("invalid state disables injection and can be repaired", (t) => {
  const file = fixture(t);fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const content of ["{broken", "null", "{}", '{"enabled":"false"}']) {
    fs.writeFileSync(file, content);
    const state = readState(file);assert.equal(state.enabled, false);assert.ok(state.error);
  }
  writeState(file, true);assert.deepEqual(readState(file), { enabled: true });
});

test("hook preserves user input, tools/context prompt, and scopes each new turn", (t) => {
  const file = fixture(t);const h = harness(file);
  const event = Object.freeze({ prompt: "Review the issue", systemPrompt: "System\nTools\nAGENTS\nOther extension", images: [] });
  const handler = h.handlers.get("before_agent_start");
  assert.deepEqual([...h.handlers.keys()], ["before_agent_start"]);
  const result = handler(event, h.ctx);
  assert.deepEqual(Object.keys(result), ["systemPrompt"]);
  assert.equal(result.systemPrompt, `${event.systemPrompt}\n\n${POLICY}`);
  assert.equal(event.prompt, "Review the issue");
  h.setLevel("high");assert.equal(handler(event, h.ctx), undefined);
  h.setLevel("xhigh");h.ctx.model = { provider: "anthropic", id: "unrelated-model" };
  assert.equal(handler(event, h.ctx), undefined);
  assert.deepEqual(handler({ ...event, systemPrompt: result.systemPrompt }, h.ctx), { systemPrompt: event.systemPrompt });
});

test("on/off/status persist across extension instances; status does not write", async (t) => {
  const file = fixture(t);const first = harness(file);const command = first.commands.get(NAME);
  await command.handler("", first.ctx);assert.equal(fs.existsSync(file), false);
  await command.handler("off", first.ctx);assert.equal(readState(file).enabled, false);
  const second = harness(file);const event = { systemPrompt: "base" };
  assert.equal(second.handlers.get("before_agent_start")(event, second.ctx), undefined);
  await command.handler("on", first.ctx);
  assert.equal(second.handlers.get("before_agent_start")(event, second.ctx).systemPrompt, applyPolicy("base", true));
  const bytes = fs.readFileSync(file, "utf8");await command.handler("invalid", first.ctx);
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
});

test("corrupt-state warning is bounded; failed persistence reports an error", async (t) => {
  const file = fixture(t);fs.mkdirSync(path.dirname(file), { recursive: true });fs.writeFileSync(file, "broken");
  const h = harness(file);const hook = h.handlers.get("before_agent_start");
  hook({ systemPrompt: "base" }, h.ctx);hook({ systemPrompt: "base" }, h.ctx);
  assert.equal(h.notifications.length, 1);
  fs.rmSync(file);fs.mkdirSync(file);
  await h.commands.get(NAME).handler("on", h.ctx);
  assert.equal(h.notifications.at(-1)[1], "error");
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [`${NAME}.json`]);
});
