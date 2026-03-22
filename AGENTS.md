# AI Agent Bootstrap

## Mandatory First Step (Every Prompt)

1. Read `CLAUDE.md` at the repository root — this is the primary project context (architecture, tech stack, commands, standards).
2. Read all files in `ai-guidance/` recursively — extended guidance, hard rules, and component-specific context.
3. Execute the user request using the loaded context as ground truth.

## Iterative / Adaptive Behavior

- Repeat this read step on every new prompt or turn.
- Do not rely on cached guidance between turns.
- If any file in `CLAUDE.md` or `ai-guidance/` changes, treat the latest file contents as the source of truth immediately.

## Priority

- `ai-guidance/CLAUDE.md` contains hard rules that override defaults.
- `CLAUDE.md` (root) contains architecture decisions and rationale — follow them unless they conflict with higher-priority system or developer safety rules.
- If guidance files are missing or empty, continue with standard best practices.
