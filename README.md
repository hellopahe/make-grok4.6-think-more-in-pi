# make-grok4.6-think-more-in-pi

[中文说明](README.zh-CN.md)

An experimental Pi extension that appends two rules about **requirement coverage** and **evidence-based completion** for `xai/grok-4.6` at `xhigh`.

The name describes a prompting hypothesis. Small exploratory tests have not established a reliable increase in reasoning tokens or answer quality. Use the switch to compare behavior on your own tasks.

## Install

```bash
pi install git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

Run `/reload` in an existing Pi session, or start a new session. Select `xai/grok-4.6` and set `/thinking xhigh`.

The policy is **enabled by default**. It activates only when all three values match at the start of a user prompt:

| Setting | Required value |
| --- | --- |
| Provider | `xai` |
| Model ID | `grok-4.6` |
| Thinking level | `xhigh` |

Other providers, aliases, model versions, and thinking levels are inactive.

## Commands

```text
/make-grok4.6-think-more-in-pi
/make-grok4.6-think-more-in-pi status
/make-grok4.6-think-more-in-pi on
/make-grok4.6-think-more-in-pi off
```

The command without arguments shows status. `on` and `off` persist across sessions in `make-grok4.6-think-more-in-pi.json` under Pi's agent directory, normally `~/.pi/agent/`. `PI_CODING_AGENT_DIR` is respected through Pi's `getAgentDir()` API.

Each new user prompt re-evaluates the setting, model, and thinking level. Changes take effect on the **next user prompt**. An already-running agent turn keeps its original prompt, including if its model or thinking level is switched mid-turn.

## Exact policy

```text
Requirement coverage and evidence

- Keep every explicit requirement of the request in view until it is completed, superseded by the user, or genuinely blocked. If something is blocked, say so plainly rather than quietly dropping it.
- Claim that work is done, fixed, tested, or verified only when the evidence supports that claim. For actions you perform, use observed tool results. When analyzing supplied records or code, identify that basis and distinguish it from checks you personally executed. State what remains unverified and why.
```

These two ideas were inspired by Grok Build's work policy. The evidence rule is adapted to cover static analysis and supplied records, so the response can accurately distinguish supplied evidence from checks the agent executed.

## How it works

The extension listens to `before_agent_start` and appends a marked block to `event.systemPrompt`. Pi retains its existing prompt, project context, tools, and other extension instructions. Repeated application produces one copy of the marked block. Later extensions can still modify the chained prompt.

In the tested xAI Responses path, Pi serializes `systemPrompt` as a **developer message**. The user message is passed through unchanged. The extension changes instruction text; it makes no API calls of its own and does not alter credentials, endpoints, reasoning effort, sampling parameters, or token limits. It does not request disclosure of private internal reasoning.

The only persistent data written by this extension is its local enabled/disabled preference. Missing state defaults to enabled. Invalid or unreadable state disables the policy and shows a warning; `on` or `off` repairs writable invalid state. Writes use an atomic rename and owner-only file permissions on Unix.

## Update and remove

```bash
pi update git:github.com/hellopahe/make-grok4.6-think-more-in-pi
pi remove git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

Reload or restart Pi after changing the installation. Removal leaves the small preference file in place; you may delete it to restore the default for a future installation.

To pin this release:

```bash
pi install git:github.com/hellopahe/make-grok4.6-think-more-in-pi@v0.1.0
```

## Development

Node.js 24 or newer is required. Tested against Pi `0.85.1` (`@earendil-works/pi-coding-agent`).

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

Unit tests cover model/effort selection, preserving the existing prompt, duplicate removal, state persistence, invalid state, and command handling. The integration test loads the real TypeScript entrypoint through Pi's loader and constructs the real Responses request offline. It uses a temporary agent directory, a dummy API key, and a blocked HTTP implementation; no model inference is performed.

This repository contains only the extension, tests, and documentation. Private conversation logs and benchmark inputs are not included.

## License

MIT. This is an independent community extension, unaffiliated with xAI.
