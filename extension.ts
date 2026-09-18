import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const POLICY = `<!-- make-grok4.6-think-more-in-pi:begin -->
Requirement coverage and evidence

- Keep every explicit requirement of the request in view until it is completed, superseded by the user, or genuinely blocked. If something is blocked, say so plainly rather than quietly dropping it.
- Claim that work is done, fixed, tested, or verified only when the evidence supports that claim. For actions you perform, use observed tool results. When analyzing supplied records or code, identify that basis and distinguish it from checks you personally executed. State what remains unverified and why.
<!-- make-grok4.6-think-more-in-pi:end -->`;

export default function makeGrokThinkMore(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event, ctx) => {
    if (
      ctx.model?.provider !== "xai" ||
      ctx.model?.id !== "grok-4.6" ||
      pi.getThinkingLevel() !== "xhigh"
    ) return;
    if (event.systemPrompt.includes(POLICY)) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${POLICY}` };
  });
}
