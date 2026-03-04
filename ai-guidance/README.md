# AI Guidance

Use this folder to define project-specific operating rules for Codex.
These files are read first on every prompt (as configured in repository `AGENTS.md`).

## How to use

1. Put stable rules in this file.
2. Split detailed rules into focused files (recommended):
   - `coding-standards.md`
   - `architecture.md`
   - `security.md`
   - `api-contracts.md`
   - `testing.md`
3. Keep rules explicit, testable, and short.

## Priority model inside this folder

- `critical`: must always be followed
- `default`: follow unless user asks otherwise
- `advice`: best-practice suggestion

## Starter template

### Critical
- Preserve framework conventions already used in each app/module.
- Do not commit secrets or hardcode credentials.
- Do not break existing API contracts without migration notes.

### Default
- Prefer small, reviewable diffs.
- Add/adjust tests for behavior changes.
- Keep types strict and avoid `any` where possible.

### Advice
- Prefer clear naming over short naming.
- Favor explicit errors/messages over silent fallback.

## Change log

Track important guidance updates here.

- YYYY-MM-DD: Initial guidance scaffold created.
