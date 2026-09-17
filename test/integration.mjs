import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { NAME, POLICY, START } from "../src/policy.mjs";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "grok-policy-integration-"));
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
const oldOffline = process.env.PI_OFFLINE;
const originalFetch = globalThis.fetch;
let networkCalls = 0;
const blockedFetch = async () => { networkCalls++; throw new Error("OFFLINE: network disabled"); };
process.env.PI_CODING_AGENT_DIR = path.join(sandbox, "agent");
process.env.PI_OFFLINE = "1";
globalThis.fetch = blockedFetch;

try {
  const sdkDist = path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
  const { loadExtensions, createExtensionRuntime } = await import(pathToFileURL(path.join(sdkDist, "core/extensions/loader.js")));
  const { buildSystemPrompt } = await import(pathToFileURL(path.join(sdkDist, "core/system-prompt.js")));
  const { streamSimple } = await import("@earendil-works/pi-ai/api/openai-responses");
  const runtime = createExtensionRuntime();
  let level = "xhigh";
  runtime.getThinkingLevel = () => level;
  const entry = fileURLToPath(new URL("../extension.ts", import.meta.url));
  const loaded = await loadExtensions([entry], sandbox, undefined, runtime);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const ext = loaded.extensions[0];
  const handler = ext.handlers.get("before_agent_start")[0];
  assert.deepEqual([...ext.handlers.keys()], ["before_agent_start"]);
  assert.ok(ext.commands.has(NAME));

  const model = { id: "grok-4.6", name: "Offline test model", api: "openai-responses", provider: "xai", baseUrl: "https://api.x.ai/v1", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 500000, maxTokens: 16384 };
  const ctx = { model, ui: { notify: () => {} } };
  const base = buildSystemPrompt({ cwd: sandbox, selectedTools: [], contextFiles: [{ path: "AGENTS.md", content: "Keep the project contract intact." }], skills: [] });
  const event = { prompt: "Review these records.", systemPrompt: base };
  const enabled = await handler(event, ctx);
  assert.equal(enabled.systemPrompt, `${base}\n\n${POLICY}`);
  assert.equal((await handler({ ...event, systemPrompt: enabled.systemPrompt }, ctx)), undefined);

  const capture = async (systemPrompt) => {
    let payload;
    const stream = streamSimple(model, { systemPrompt, messages: [{ role: "user", content: event.prompt, timestamp: 0 }], tools: [] }, {
      apiKey: "OFFLINE_DUMMY_NO_REAL_CREDENTIALS", fetch: blockedFetch, reasoning: "xhigh", maxTokens: 4096, maxRetries: 0,
      onPayload: (request) => { payload = structuredClone(request); throw new Error("OFFLINE capture before HTTP"); },
    });
    for await (const item of stream) { /* Drain the expected offline error. */ }
    assert.ok(payload);
    return payload;
  };
  const plain = await capture(base);
  const injected = await capture(enabled.systemPrompt);
  assert.equal(plain.input[0].role, "developer");
  assert.equal(injected.input[0].role, "developer");
  assert.equal(injected.input[0].content, `${plain.input[0].content}\n\n${POLICY}`);
  const normalized = structuredClone(injected);
  normalized.input[0].content = plain.input[0].content;
  assert.deepEqual(normalized, plain);

  const command = ext.commands.get(NAME);
  await command.handler("off", ctx);
  assert.equal(JSON.parse(fs.readFileSync(path.join(process.env.PI_CODING_AGENT_DIR, `${NAME}.json`), "utf8")).enabled, false);
  assert.equal(await handler(event, ctx), undefined);
  await command.handler("on", ctx);
  level = "high";
  assert.equal(await handler(event, ctx), undefined);
  level = "xhigh";
  assert.equal(await handler(event, { ...ctx, model: { ...model, provider: "other-provider" } }), undefined);
  assert.equal(enabled.systemPrompt.split(START).length - 1, 1);
  assert.equal(networkCalls, 0);
  console.log("PASS: native Pi loader, model/effort gates, persistent toggles, idempotent injection, and Responses developer-message serialization; zero network calls and no credentials loaded.");
} finally {
  globalThis.fetch = originalFetch;
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline;
  fs.rmSync(sandbox, { recursive: true, force: true });
}
