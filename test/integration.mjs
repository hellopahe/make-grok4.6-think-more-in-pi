import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const NAME = "make-grok4.6-think-more-in-pi";
const START = `<!-- ${NAME}:begin -->`;

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "grok-policy-integration-"));
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
const oldOffline = process.env.PI_OFFLINE;
const originalFetch = globalThis.fetch;
let networkCalls = 0;
const blockedFetch = async () => { networkCalls++; throw new Error("OFFLINE: network disabled"); };
process.env.PI_CODING_AGENT_DIR = path.join(sandbox, "agent");
process.env.PI_OFFLINE = "1";
globalThis.fetch = blockedFetch;
fs.mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
const legacyState = path.join(process.env.PI_CODING_AGENT_DIR, `${NAME}.json`);
const legacyBytes = '{"enabled":false}\n';
fs.writeFileSync(legacyState, legacyBytes);

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
  assert.equal(ext.commands.size, 0);

  const model = { id: "grok-4.6", name: "Offline test model", api: "openai-responses", provider: "xai", baseUrl: "https://api.x.ai/v1", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 500000, maxTokens: 16384 };
  const ctx = { model, ui: { notify: () => {} } };
  const base = buildSystemPrompt({ cwd: sandbox, selectedTools: [], contextFiles: [{ path: "AGENTS.md", content: "Keep the project contract intact." }], skills: [] });
  const event = { prompt: "Review these records.", systemPrompt: base };
  const enabled = await handler(event, ctx);
  assert.ok(enabled.systemPrompt.startsWith(`${base}\n\n${START}`));
  assert.ok(enabled.systemPrompt.includes("Keep every explicit requirement"));
  assert.ok(enabled.systemPrompt.includes("only when the evidence supports that claim"));
  const policy = enabled.systemPrompt.slice(base.length + 2);
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
  assert.equal(injected.input[0].content, `${plain.input[0].content}\n\n${policy}`);
  const normalized = structuredClone(injected);
  normalized.input[0].content = plain.input[0].content;
  assert.deepEqual(normalized, plain);

  level = "high";
  assert.equal(await handler(event, ctx), undefined);
  level = "xhigh";
  assert.equal(await handler(event, { ...ctx, model: { ...model, provider: "other-provider" } }), undefined);
  assert.equal(enabled.systemPrompt.split(START).length - 1, 1);
  assert.equal(fs.readFileSync(legacyState, "utf8"), legacyBytes);
  assert.deepEqual(fs.readdirSync(process.env.PI_CODING_AGENT_DIR), [`${NAME}.json`]);
  assert.equal(networkCalls, 0);
  console.log("PASS: native Pi loader, no internal commands or state, legacy disabled state ignored, model/effort gates, duplicate protection, and Responses developer-message serialization; zero network calls.");
} finally {
  globalThis.fetch = originalFetch;
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline;
  fs.rmSync(sandbox, { recursive: true, force: true });
}
