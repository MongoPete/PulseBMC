# greenfield-project

New project scaffold with [Karpathy-inspired agent guidelines](https://github.com/multica-ai/andrej-karpathy-skills) applied.

## Agent setup (Cursor)

The rule at `.cursor/rules/karpathy-guidelines.mdc` is configured with `alwaysApply: true`, so the four principles apply in every Cursor session:

1. **Think Before Coding** — surface assumptions and tradeoffs before implementing
2. **Simplicity First** — minimum code that solves the problem
3. **Surgical Changes** — touch only what the task requires
4. **Goal-Driven Execution** — define verifiable success criteria

Confirm in Cursor under **Settings → Rules** that `karpathy-guidelines` appears.

## Cross-tool compatibility

`CLAUDE.md` mirrors the same guidelines for Claude Code or other tools that read a root instruction file. Add project-specific rules under the **Project-Specific Guidelines** section as the codebase grows.

## Next steps

1. Open this folder in Cursor: `File → Open Folder → greenfield-project`
2. Tell the agent what you want to build (stack, features, constraints)
3. Extend `.cursor/rules/` or `CLAUDE.md` with project conventions as they emerge
