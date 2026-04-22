# ACP Question Compatibility Findings

## Summary

As of April 22, 2026, approval requests are part of the stable ACP client surface, but general user-question prompts are not something we can treat as broadly standardized across providers.

For our next implementation slices, we should assume:

- approvals are relatively portable
- questions are provider-specific
- provider mode/capability gating matters as much as payload shape

## ACP Compatibility

- The official ACP documentation clearly documents `session/request_permission`.
- I could not verify an equivalent stable ACP-standard method for general "ask the user a question" flows.
- In our repo, `session/request_user_input` currently exists as a local ACP-side contract we added for provider integrations, not as something we should assume every ACP provider supports the same way.

Practical implication:

- "questions" should be modeled in our app as a unified product capability with provider-specific transports behind it
- we should not assume ACP alone gives us a single portable question protocol

## How Codex Does It

Codex appears to have two relevant surfaces:

1. Codex ACP integration

- supports a `request_user_input` concept in practice
- but tool availability is gated by collaboration mode

2. Codex app-server protocol

- has a separate request shape for questions
- uses `item/tool/requestUserInput`
- marks this flow as `EXPERIMENTAL`
- question payloads can include:
  - `id`
  - `header`
  - `question`
  - `options`
  - `isOther`
  - `isSecret`

Practical implication:

- Codex question UX is real, but it is not just "plain ACP questions"
- if we want Codex parity, we need to think in terms of a Codex-specific adapter contract, not only a shared ACP contract

## Codex Mode Gating

The most important finding for the next agent is that Codex ACP can reject question requests before they ever reach our overlay UI.

Observed runtime error:

`request_user_input is unavailable in Default mode [blocked]`

This means:

- the provider is blocking the tool call internally
- our overlay layer never receives the request
- prompt wording alone cannot solve the issue
- a hidden bootstrap/system-style instruction can improve formatting behavior, but it cannot bypass provider mode restrictions

## Mode Switching

Right now, our local ACP client/runtime layer does not expose a confirmed way to switch a Codex ACP session into a question-capable mode.

What this means in practice:

- if Codex stays in `Default` mode, question overlays will not be reliable even if the agent is instructed to use the right payload
- proper Codex question support likely requires one of:
  - a provider mode switch before prompting
  - capability detection that disables question support when the provider blocks it
  - moving to the Codex app-server protocol for question flows instead of relying on ACP alone

## Guidance For Future Implementation

- Keep the app-level question interface unified.
- Keep provider transports separate behind that interface.
- Treat Codex ACP question support as conditional, not guaranteed.
- Do not assume a bootstrap prompt is enough; the provider mode must allow the question tool in the first place.
- If another agent continues this work, the next high-value step is to confirm whether Codex ACP exposes a usable mode-switching API or capability signal.

## References

- ACP overview: https://agentclientprotocol.com/protocol/overview
- ACP tool calls: https://agentclientprotocol.com/protocol/tool-calls
- Codex protocol notes: https://github.com/openai/codex/blob/main/codex-rs/docs/protocol_v1.md
- Codex app-server README: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- Codex app-server schema: https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/ServerRequest.json
