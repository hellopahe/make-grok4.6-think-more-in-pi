# make-grok4.6-think-more-in-pi

[English](README.md)

一个小型实验性 Pi 扩展，为 `xai/grok-4.6` 的 `xhigh` 档位追加两条要求追踪与证据核对规则。它不保证增加 reasoning tokens 或提高答案质量。

## 安装

```bash
pi install git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

在 Pi 中运行 `/reload`，或启动新会话。

## 启用和禁用

**只使用 Pi 自身的扩展管理（`pi config`）控制启用或禁用。**

扩展被加载时，会在 `xai/grok-4.6 + xhigh` 的用户回合开始前自动追加规则，保留原有提示词。其他模型和档位在新回合开始时不追加。

插件没有独立命令、配置项或状态文件。v0.1.1 忽略旧版本的偏好文件。改变扩展启用状态后重新加载；提示词变化从下一条用户输入生效。

## 完整规则

```text
Requirement coverage and evidence

- Keep every explicit requirement of the request in view until it is completed, superseded by the user, or genuinely blocked. If something is blocked, say so plainly rather than quietly dropping it.
- Claim that work is done, fixed, tested, or verified only when the evidence supports that claim. For actions you perform, use observed tool results. When analyzing supplied records or code, identify that basis and distinguish it from checks you personally executed. State what remains unverified and why.
```

规则思路借鉴 Grok Build 的工作策略，证据条款同时适用于静态分析和用户提供的记录。

## 实现

单个 TypeScript 文件、一个 `before_agent_start` 钩子，只追加一份规则。在 Pi 的 xAI Responses 路径中，规则随 developer 消息发送。用户消息、模型参数、鉴权和 endpoint 保持不变；插件不读写文件，也不发起网络请求。

## 更新或卸载

```bash
pi update git:github.com/hellopahe/make-grok4.6-think-more-in-pi
pi remove git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

之后重新加载或重启 Pi。

## 开发验证

需要 Node.js 24 或更新版本，针对 Pi 0.85.1 验证。

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

离线测试通过 Pi 原生加载器检查模型/档位限制、去重和旧禁用状态不再生效，并在 HTTP 发送前捕获 Responses 请求。测试使用临时 agent 目录和假 API key，不进行模型推理。

## 许可证

MIT。独立社区扩展，与 xAI 没有隶属关系。
