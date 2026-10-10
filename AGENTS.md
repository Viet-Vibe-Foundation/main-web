# Agent instructions (main-web)

Guidance for AI agents working in this repository. Humans can edit this file as team conventions evolve.

## Project snapshot

- **Stack**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS, Prisma, NextAuth.js
- **Package manager**: Yarn (`yarn install --immutable`, `yarn dev`, `yarn run build`)
- **Locales**: `app/[locale]/` with i18n JSON under `locales/`
- **Docs**: [README.md](./README.md), [documentation/](./documentation/), [project Wiki](https://github.com/Viet-Vibe-Foundation/main-web/wiki)

Before pushing, run `yarn run build` locally when you change code that affects production builds.

---

## Reading and exploring files

**Read source and config with the IDE file tools (Read, Grep, Glob)—not the shell.**

- Do **not** use the terminal to dump file contents: `cat`, `type`, `Get-Content`, `head`, `tail`, `more`, `less`, etc.
- Do **not** use one-off scripts to print files: `python -c "open(...)"`, `node -e "..."`, `powershell -Command "Get-Content ..."`, and similar.
- Use **Read** for file contents, **Grep** for search, **Glob** for path discovery.

Shell is for builds, tests, git, package installs, and other commands—not for substituting the read tools.

---

## Shell on Windows (PowerShell)

This environment often uses **Windows PowerShell 5.x**, where **`&&` is not a valid statement separator** and causes:

```text
The token '&&' is not a valid statement separator in this version.
```

**Do not chain commands with `&&` in agent shell commands.**

Prefer one of these instead:

1. **Separate invocations** — run one command per shell call when order matters and the first must succeed.
2. **Semicolon** — `command1; command2` (runs sequentially; later commands still run if an earlier one fails unless you check `$LASTEXITCODE`).
3. **Conditional (PS 5)** — `command1; if ($LASTEXITCODE -eq 0) { command2 }` when the second step must run only after success.

Examples:

```powershell
# Avoid
git status && git diff

# Prefer
git status
git diff
```

```powershell
# Avoid
cd d:\Study\Project\VVF\main-web && yarn run build

# Prefer
Set-Location d:\Study\Project\VVF\main-web
yarn run build
```

Note: `package.json` scripts may still use `&&` internally (npm/yarn run them in a shell that supports it). That is fine—this rule applies to **commands the agent types in the terminal tool**, not to existing script definitions unless you are editing them for Windows compatibility.

---

## Coding expectations

- Match existing patterns in the file and folder you are editing; keep diffs minimal.
- Do not commit unless the user explicitly asks.
- Do not commit secrets (`.env`, keys, credentials).
- Prefer absolute paths when referencing this repo in tool calls on Windows.

---

## Where to look

| Area | Location |
|------|----------|
| App routes & pages | `app/` |
| Shared UI | `components/` |
| Server actions / libs | `lib/`, `actions/` (if present) |
| Database schema | `prisma/` |
| Translations | `locales/` |
| Next config | `next.config.ts` |

Extend this file with team-specific rules (auth, Stripe webhooks, cache/revalidation, PR checklist) as needed.
