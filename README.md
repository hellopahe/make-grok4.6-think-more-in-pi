# make-grok4.6-think-more-in-pi

[中文说明](README.zh-CN.md)

A small experimental Pi extension that appends two requirement-coverage and evidence-checking rules for `xai/grok-4.6` at `xhigh`. An increase in reasoning tokens or answer quality is not guaranteed.

## Install

```bash
pi install git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

Run `/reload` in Pi or start a new session.

## Enable or disable

**Use Pi's extension management (`pi config`). That is the only switch.**

When loaded, the extension automatically appends the rules for `xai/grok-4.6` at `xhigh`, preserving the existing prompt. Other models and thinking levels are unaffected at the start of a user prompt.

The extension has no custom commands, settings, or state files. Version 0.1.1 ignores the old version's preference file. Reload after changing the extension's enabled state; prompt changes take effect at the next user prompt.

## Policy

```text
Requirement coverage and evidence

- Keep every explicit requirement of the request in view until it is completed, superseded by the user, or genuinely blocked. If something is blocked, say so plainly rather than quietly dropping it.
- Claim that work is done, fixed, tested, or verified only when the evidence supports that claim. For actions you perform, use observed tool results. When analyzing supplied records or code, identify that basis and distinguish it from checks you personally executed. State what remains unverified and why.
```

These ideas were inspired by Grok Build's work policy; the evidence rule also covers static analysis and supplied records.

## Implementation

One TypeScript file and one `before_agent_start` hook append the policy once. In Pi's xAI Responses path, the text is serialized as a developer message. User messages, model settings, credentials, and endpoints are unchanged. The extension performs no file I/O or network requests.

## Update or remove

```bash
pi update git:github.com/hellopahe/make-grok4.6-think-more-in-pi
pi remove git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

Reload or restart Pi afterward.

## Development

Node.js 24 or newer; tested with Pi 0.85.1.

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

The offline test loads the real extension through Pi, checks model/effort selection and duplicate protection, verifies that old disabled state is ignored, and captures the Responses payload before HTTP. It uses a temporary agent directory and a dummy API key; no model inference occurs.

## License

MIT. Independent community extension, unaffiliated with xAI.
