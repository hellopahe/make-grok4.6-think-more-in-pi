# make-grok4.6-think-more-in-pi

[English](README.md)

一个实验性 Pi 扩展，为 `xai/grok-4.6` 的 `xhigh` 档位追加两条规则：**追踪每项要求，并根据证据判断工作是否完成。**

插件名表达的是一个提示词假设。现有小样本实验尚未确认它能稳定增加 reasoning tokens 或提高答案质量，可通过开关观察你自己的任务。

## 安装

```bash
pi install git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

已有 Pi 会话运行 `/reload`，或启动新会话。选择 `xai/grok-4.6`，并运行 `/thinking xhigh`。

默认开启。每条用户输入开始时，同时满足以下条件才追加规则：

| 项目 | 要求 |
| --- | --- |
| Provider | `xai` |
| 模型 ID | `grok-4.6` |
| Thinking level | `xhigh` |

其他 provider、别名、模型版本和档位均不启用。

## 开关

```text
/make-grok4.6-think-more-in-pi
/make-grok4.6-think-more-in-pi status
/make-grok4.6-think-more-in-pi on
/make-grok4.6-think-more-in-pi off
```

不带参数时显示状态。`on` 和 `off` 会跨会话保存，文件位于 Pi agent 目录下的 `make-grok4.6-think-more-in-pi.json`，通常为 `~/.pi/agent/`。插件通过 Pi 的 `getAgentDir()` 兼容 `PI_CODING_AGENT_DIR`。

开关、模型和档位会在**下一条用户输入**开始时重新判断。正在运行的 agent 回合继续使用该回合开始时的提示词；回合中途切换模型或档位也遵循这一规则。

## 实际注入的完整英文规则

```text
Requirement coverage and evidence

- Keep every explicit requirement of the request in view until it is completed, superseded by the user, or genuinely blocked. If something is blocked, say so plainly rather than quietly dropping it.
- Claim that work is done, fixed, tested, or verified only when the evidence supports that claim. For actions you perform, use observed tool results. When analyzing supplied records or code, identify that basis and distinguish it from checks you personally executed. State what remains unverified and why.
```

这两条规则借鉴了 Grok Build 的工作策略。第二条针对静态分析和用户提供的记录做了适配，要求区分已有材料与 agent 亲自执行的验证。

## 实现方式

插件使用 `before_agent_start`，向 `event.systemPrompt` 追加带标记的规则块。Pi 原提示词、项目上下文和其他扩展指令都保留；重复应用时只保留一份规则块，后加载的扩展仍可继续修改提示词。

当前验证过的 xAI Responses 路径会把 Pi 的 `systemPrompt` 序列化为 **developer 消息**。用户消息原文保持不变。插件只改变指令文本，自身不发起 API 请求，也不改鉴权、endpoint、reasoning effort、采样参数或 token 上限，不要求公开内部推理过程。

唯一写入的持久数据是本地启用状态。状态文件不存在时默认开启；文件损坏或不可读时停用并提示。可写的异常状态可通过 `on` 或 `off` 修复。状态写入使用原子重命名，Unix 下文件仅当前用户可读写。

## 更新和卸载

```bash
pi update git:github.com/hellopahe/make-grok4.6-think-more-in-pi
pi remove git:github.com/hellopahe/make-grok4.6-think-more-in-pi
```

安装状态变化后运行 `/reload` 或重启 Pi。卸载会保留小型偏好文件；删除该文件可让下一次安装恢复默认开启。

固定到本次版本：

```bash
pi install git:github.com/hellopahe/make-grok4.6-think-more-in-pi@v0.1.0
```

## 开发与验证

需要 Node.js 24 或更新版本，已针对 Pi `0.85.1` 验证。

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

单元测试覆盖模型/档位限制、原提示词保留、去重、持久开关、异常状态和命令处理。集成测试通过 Pi 原生加载器加载 TypeScript 入口，并离线构造真实 Responses 请求，核验 developer 消息与其他参数。测试使用临时 agent 目录、假 API key 和阻断 HTTP 的实现，不进行模型推理。

仓库仅包含插件、测试和文档，不包含私人会话日志或实验题目。

## 许可证

MIT。独立社区扩展，与 xAI 没有隶属关系。
