# Codex Guidance Bootstrap

## Mandatory First Step (Every Prompt)
- Before doing anything else, read the folder `ai-guidance` from this repository root.
- Load all guidance files in `ai-guidance` (recursively) first, then execute the user request.

## Iterative / Adaptive Behavior
- Repeat this read step on every new prompt/turn.
- Do not rely on cached guidance between turns.
- If any file in `ai-guidance` changes, treat the latest file contents as the source of truth immediately.

## Priority
- Apply `ai-guidance` instructions unless they conflict with higher-priority system/developer safety rules.
- If `ai-guidance` is missing or empty, continue with normal best practices.
