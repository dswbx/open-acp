# OpenACP Agent Harness Concepts

Fetched from Claude Design on 2026-05-27.

Source URL:
`https://api.anthropic.com/v1/design/h/3hiNQjuW2ZjyoYFqMPBdIA?open_file=open-acp+concepts.html`

This directory stores the full design handoff for continued implementation work, not only the permission approval variant.

## Contents

- `openacp-design-bundle.tar.gz` - original fetched bundle.
- `openacp/README.md` - upstream handoff instructions.
- `openacp/chats/chat1.md` - design conversation and intent.
- `openacp/project/open-acp concepts.html` - main design canvas entrypoint.
- `openacp/project/tasks.jsx` - agent task display variants.
- `openacp/project/plan.jsx` - plan display variants.
- `openacp/project/permissions.jsx` - permission approval variants, including Variant A.
- `openacp/project/shell.jsx`, `design-canvas.jsx`, `main.jsx`, `tokens.css` - shared prototype shell and canvas code.
- `openacp/project/uploads/` - screenshots/assets used by the prototype.

To inspect the prototype locally, serve `openacp/project/` over HTTP. The React/Babel prototype does not fully mount from `file://`.
