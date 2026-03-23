---
title: "Auto Model Reasoning"
description: "How Kilo Auto configures reasoning levels across modes, models, and subagents"
---

# Auto Model Reasoning

This document explains how reasoning effort is configured when using Kilo Auto tiers (`kilo-auto/frontier`, `kilo-auto/balanced`, `kilo-auto/free`), and how reasoning levels work across different modes, subagents, and provider-specific APIs.

## Overview

Kilo Auto uses a **split client/server architecture** for reasoning configuration:

- **Auto tiers** (`kilo-auto/*`): Reasoning levels are defined **server-side** by the Kilo API and delivered as part of each model's `variants` field. The client passes them through directly.
- **Direct provider models** (e.g., `openai/gpt-5`, `anthropic/claude-sonnet-4.6`): Reasoning levels are computed **client-side** in `packages/opencode/src/provider/transform.ts` based on the provider SDK and model family.

This distinction is important: Auto tier reasoning configuration can be updated server-side without a client release, while direct provider reasoning is hardcoded in the client.

## How Auto Tiers Configure Reasoning

### Server-Defined Variants

When the Kilo API returns an auto model, it includes an `opencode.variants` field — a map from mode names to provider options (including the underlying model and any reasoning parameters):

```json
{
  "opencode": {
    "variants": {
      "architect": { "model": "anthropic/claude-opus-4-6", ... },
      "code": { "model": "anthropic/claude-sonnet-4-6", ... }
    }
  }
}
```

The client passes these through without modification (`transform.ts:380-384`):

```ts
if (model.api.npm === "@kilocode/kilo-gateway" && model.variants && Object.keys(model.variants).length > 0) {
  return model.variants // Server-defined variants passed through directly
}
```

This means the exact reasoning parameters for each auto tier + mode combination are controlled by the Kilo API. The tables below reflect the current configuration but may change without client updates.

### Variant Resolution Flow

1. User selects an auto tier (e.g., `kilo-auto/frontier`)
2. Model is fetched with server-defined variants from `api.kilo.ai`
3. User works in a mode (e.g., Code) — the agent name becomes the variant key
4. `prompt.ts` resolves the variant name from the agent config
5. `llm.ts` merges the variant options into the LLM call via deep merge:
   ```
   base options → model.options → agent.options → variant options
   ```
6. The `x-kilocode-mode` header is also sent with the agent name for server-side routing

The variant is merged **last**, so it overrides all other option sources — including the underlying model ID that gets sent to OpenRouter.

### Current Mode-to-Model Mappings

These are the current server-side mappings. See [Auto Model](/docs/code-with-ai/agents/auto-model) for the user-facing documentation.

#### Auto Frontier (`kilo-auto/frontier`)

| Mode           | Underlying Model  | Task Type               |
| -------------- | ----------------- | ----------------------- |
| `architect`    | Claude Opus 4.6   | Planning, design        |
| `orchestrator` | Claude Opus 4.6   | Multi-step coordination |
| `ask`          | Claude Opus 4.6   | Questions, explanations |
| `plan`         | Claude Opus 4.6   | Planning, reasoning     |
| `general`      | Claude Opus 4.6   | General assistance      |
| `debug`        | Claude Opus 4.6   | Debugging               |
| `code`         | Claude Sonnet 4.6 | Code generation         |
| `build`        | Claude Sonnet 4.6 | Implementation          |
| `explore`      | Claude Sonnet 4.6 | Codebase exploration    |

#### Auto Balanced (`kilo-auto/balanced`)

| Mode           | Underlying Model    | Task Type               |
| -------------- | ------------------- | ----------------------- |
| `architect`    | Kimi K2.5           | Planning, design        |
| `orchestrator` | Kimi K2.5           | Multi-step coordination |
| `ask`          | Kimi K2.5           | Questions, explanations |
| `plan`         | Kimi K2.5           | Planning, reasoning     |
| `general`      | Kimi K2.5           | General assistance      |
| `debug`        | Kimi K2.5           | Debugging               |
| `code`         | Minimax M2.5 (Free) | Code generation         |
| `build`        | Minimax M2.5 (Free) | Implementation          |
| `explore`      | Minimax M2.5 (Free) | Codebase exploration    |

#### Auto Free (`kilo-auto/free`)

All modes route to `minimax/minimax-m2.5:free`.

### Reasoning in Auto Tiers

Since auto tier variants are server-defined, the reasoning parameters (if any) are included in the variant data returned by the API. The client does not independently compute reasoning levels for auto models.

Some models used by auto tiers (like Minimax M2.5 and Kimi K2.5) do not support configurable reasoning effort — they use their native thinking behavior with no client-side effort control. The `variants()` function in `transform.ts` explicitly returns `{}` (no variants) for these model families:

```ts
if (
  id.includes("deepseek") ||
  id.includes("minimax") ||
  id.includes("glm") ||
  id.includes("mistral") ||
  id.includes("kimi") ||
  id.includes("k2p5")
)
  return {}
```

For auto tiers that route to models with reasoning support (e.g., Claude in Frontier), the server can include reasoning parameters in the variant, and the client will merge them into the request via the OpenRouter-compatible `reasoning.effort` format.

## Subagent Reasoning

### Model Inheritance

When a subagent is spawned via the `task` tool (`packages/opencode/src/tool/task.ts:106-109`):

```ts
const model = agent.model ?? {
  modelID: msg.info.modelID,
  providerID: msg.info.providerID,
}
```

The subagent uses its own model if one is configured in its agent definition. Otherwise, it **inherits the parent agent's model** — including any auto tier like `kilo-auto/frontier`.

### Mode-Based Routing for Subagents

When a subagent inherits a `kilo-auto/*` model, its own agent name is sent as the `x-kilocode-mode` header and used as the variant key. This means the subagent gets mode-appropriate routing:

```
Parent (Code agent, kilo-auto/frontier) spawns Explore subagent
  → Subagent inherits kilo-auto/frontier
  → x-kilocode-mode: "explore" header sent
  → Server routes to Claude Sonnet 4.6 (explore variant)
```

### Current Subagent Agents

| Agent     | Mode     | Description                                           |
| --------- | -------- | ----------------------------------------------------- |
| `general` | subagent | General-purpose, inherits parent model                |
| `explore` | subagent | Read-only codebase exploration, inherits parent model |

Both subagents inherit the parent's model by default and get mode-appropriate routing through the variant system.

### Small Model for Background Tasks

Internal background tasks (session titles, commit messages, summaries) use `kilo-auto/small` when the Kilo provider is active. The `getSmallModel()` function in `provider.ts` prioritizes:

1. User-configured `small_model` setting
2. `kilo-auto/small` for the Kilo provider
3. Provider-specific small models (e.g., `claude-haiku-4.5`, `gemini-3-flash`)
4. Global fallback to `kilo/kilo-auto/small` if the Kilo provider exists

Small model calls use reduced reasoning via `smallOptions()` in `transform.ts`:

| Provider              | Small Model Reasoning                   |
| --------------------- | --------------------------------------- |
| OpenAI (GPT-5.x)      | `reasoningEffort: "low"` or `"minimal"` |
| Google (Gemini 3)     | `thinkingLevel: "minimal"`              |
| Google (Gemini 2.5)   | `thinkingBudget: 0`                     |
| Kilo Gateway (Google) | `reasoning.enabled: false`              |
| Kilo Gateway (other)  | `reasoningEffort: "minimal"`            |
| Venice                | `disableThinking: true`                 |

## Direct Provider Reasoning (Non-Auto)

When using a model directly (not through `kilo-auto/*`), reasoning levels are computed client-side by the `variants()` function in `transform.ts`. Users can select a variant in their agent config to control reasoning effort.

### Provider-Specific Reasoning Formats

Each AI provider uses a different API format for reasoning control:

#### Anthropic (Claude)

**Adaptive models** (Opus 4.6, Sonnet 4.6):

| Variant  | Config                                                 |
| -------- | ------------------------------------------------------ |
| `low`    | `{ thinking: { type: "adaptive" }, effort: "low" }`    |
| `medium` | `{ thinking: { type: "adaptive" }, effort: "medium" }` |
| `high`   | `{ thinking: { type: "adaptive" }, effort: "high" }`   |
| `max`    | `{ thinking: { type: "adaptive" }, effort: "max" }`    |

**Older Claude models** (pre-adaptive):

| Variant | Config                                                   |
| ------- | -------------------------------------------------------- |
| `high`  | `{ thinking: { type: "enabled", budgetTokens: 16000 } }` |
| `max`   | `{ thinking: { type: "enabled", budgetTokens: 31999 } }` |

#### OpenAI (GPT-5 family)

| Variant   | Config                                                                  |
| --------- | ----------------------------------------------------------------------- |
| `none`    | `{ reasoningEffort: "none", reasoningSummary: "auto", include: [...] }` |
| `minimal` | `{ reasoningEffort: "minimal", ... }`                                   |
| `low`     | `{ reasoningEffort: "low", ... }`                                       |
| `medium`  | `{ reasoningEffort: "medium", ... }`                                    |
| `high`    | `{ reasoningEffort: "high", ... }`                                      |
| `xhigh`   | `{ reasoningEffort: "xhigh", ... }`                                     |

Availability varies by model: `none` requires `release_date >= 2025-11-13`, `xhigh` requires `>= 2025-12-04`.

Default base options for GPT-5 (non-pro): `reasoningEffort: "medium"`, `textVerbosity: "low"`.

#### Google (Gemini)

**Gemini 2.5**:

| Variant | Config                                                                 |
| ------- | ---------------------------------------------------------------------- |
| `high`  | `{ thinkingConfig: { includeThoughts: true, thinkingBudget: 16000 } }` |
| `max`   | `{ thinkingConfig: { includeThoughts: true, thinkingBudget: 24576 } }` |

**Gemini 3.x**:

| Variant  | Config                                                                          |
| -------- | ------------------------------------------------------------------------------- |
| `low`    | `{ thinkingConfig: { includeThoughts: true, thinkingLevel: "low" } }`           |
| `medium` | `{ thinkingConfig: { includeThoughts: true, thinkingLevel: "medium" } }` (3.1+) |
| `high`   | `{ thinkingConfig: { includeThoughts: true, thinkingLevel: "high" } }`          |

Default base options for Gemini 3: `thinkingLevel: "high"`.

#### OpenRouter / Kilo Gateway

For models routed through OpenRouter (including via Kilo Gateway), reasoning is set using the OpenRouter format:

| Variant   | Config                                 |
| --------- | -------------------------------------- |
| `none`    | `{ reasoning: { effort: "none" } }`    |
| `minimal` | `{ reasoning: { effort: "minimal" } }` |
| `low`     | `{ reasoning: { effort: "low" } }`     |
| `medium`  | `{ reasoning: { effort: "medium" } }`  |
| `high`    | `{ reasoning: { effort: "high" } }`    |
| `xhigh`   | `{ reasoning: { effort: "xhigh" } }`   |

Only applies to Claude, GPT, Gemini 3, and Mercury models on OpenRouter. Models like DeepSeek, Minimax, Kimi, and Mistral return no variants (empty `{}`).

#### Amazon Bedrock

**Adaptive Anthropic**: `{ reasoningConfig: { type: "adaptive", maxReasoningEffort: "low"|"medium"|"high"|"max" } }`

**Older Anthropic**: `{ reasoningConfig: { type: "enabled", budgetTokens: 16000|31999 } }`

**Amazon Nova**: `{ reasoningConfig: { type: "enabled", maxReasoningEffort: "low"|"medium"|"high" } }`

#### Models Without Reasoning Control

These model families do not support configurable reasoning — the `variants()` function returns `{}`:

- DeepSeek
- Minimax
- Kimi / K2.5
- Mistral
- Cohere
- Perplexity
- GLM

## Option Merge Order

At LLM call time (`llm.ts:114-118`), options are merged in this order:

```
1. Base options (from ProviderTransform.options())
2. Model options (model.options)
3. Agent options (agent.options)
4. Variant options (from server variants or local variants)
```

Each layer deep-merges into the previous, so **later layers override earlier ones**. The variant (which for auto tiers includes the underlying model ID and reasoning config) has the final say.

## Key Files

| File                                          | Role                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/kilo-gateway/src/api/constants.ts`  | Default model constants                                                    |
| `packages/kilo-gateway/src/api/models.ts`     | Fetches models from Kilo API, parses `opencode.variants`                   |
| `packages/opencode/src/provider/transform.ts` | Core reasoning configuration — `variants()`, `options()`, `smallOptions()` |
| `packages/opencode/src/provider/provider.ts`  | Model loading, variant storage, `getSmallModel()`                          |
| `packages/opencode/src/session/llm.ts`        | LLM call assembly — merges options, sends `x-kilocode-mode` header         |
| `packages/opencode/src/session/prompt.ts`     | Resolves variant from agent config                                         |
| `packages/opencode/src/agent/agent.ts`        | Agent definitions with mode and variant fields                             |
| `packages/opencode/src/config/config.ts`      | Agent config schema including `variant` field                              |
| `packages/opencode/src/tool/task.ts`          | Subagent spawning — model inheritance logic                                |
