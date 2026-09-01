# Domain Docs

How engineering skills should consume this repository's domain documentation when exploring the codebase.

## Before exploring, read these

- Root `CONTEXT.md`, when present.
- Root `CONTEXT-MAP.md`, when present; it points to context-specific documentation.
- Relevant architectural decisions under `docs/adr/`.

If these files do not exist, proceed silently. Domain documentation is created only when terminology or architectural decisions need to be recorded.

## File structure

This repository currently uses a single-context layout:

```text
/
|-- CONTEXT.md
|-- docs/adr/
`-- src/
```

If the browser extension and a future MCP implementation become separately owned packages in this repository, revisit whether a multi-context layout is needed.

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md`. If a required concept is missing, reconsider whether new terminology is necessary or record the gap for domain modeling.

## Flag ADR conflicts

Explicitly report proposals that conflict with an existing ADR instead of silently replacing the recorded decision.

