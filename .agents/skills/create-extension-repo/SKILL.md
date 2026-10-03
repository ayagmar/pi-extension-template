---
name: create-extension-repo
description: Create a new GitHub repository from this template with gh CLI, clone it locally and remove this template's bootstrap skill from the generated repo, then guide setup-template, pi 1.0 extension conventions and the release flow. Use when asked to make a new extension repo from this template.
compatibility: Requires gh CLI auth, git, and node. Run from the template repository root unless you pass --template explicitly.
---

# Create Extension Repo

Use this skill when the user wants a fresh extension repository created from this template.

## Collect first

Get these inputs before running anything:

- target repository name: `repo` or `owner/repo`
- visibility: `private`, `public`, or `internal`
- optional description
- optional team
- optional template override if not using this repo's `origin`

Default visibility to `private` if the user does not specify one.

## Command

Run the helper script from this repo root:

```bash
bash ./.agents/skills/create-extension-repo/scripts/create-from-template.sh <target> --private
```

Examples:

```bash
bash ./.agents/skills/create-extension-repo/scripts/create-from-template.sh my-new-extension --private
bash ./.agents/skills/create-extension-repo/scripts/create-from-template.sh my-org/my-new-extension --public --description "Pi extension for ..."
```

## What the helper does

1. Verifies `gh`, `git`, and `node` are available.
2. Uses `gh repo create --template` with this repo's GitHub origin by default.
3. Clones the new repository locally.
4. Removes the generated repo's `.agents/skills/` directory (and `.agents/` if it is then empty)
   and the skill's template-only test, `test/bootstrap-skill.test.ts`.
5. Creates and pushes a cleanup commit so the generated repo does not keep this bootstrap skill.

## After creation

Tell the user the local repo path and suggest the next steps:

```bash
cd <repo-dir>
pnpm install
pnpm run setup-template
pnpm run check
```

`setup-template` prompts for the extension name, npm package name (scoped names such as
`@ayagmar/pi-foo` are fine), description, command, tool name, state entry type and GitHub
repository (defaults to the clone's `origin`). It rewrites `src/constants.ts`, the starters,
`package.json` (`name`, `description`, `repository`, `homepage`, `bugs`), the README install
sources, resets `version` to `0.0.0` and `CHANGELOG.md`, and removes the template-only
`"private": true` flag. When driving it non-interactively, pipe one answer per line (blank line =
default), e.g. `printf 'pi-foo\n@ayagmar/pi-foo\n' | pnpm run setup-template`.

Then remind them to review identifiers in:

- `package.json`
- `src/constants.ts`
- `README.md`
- `LICENSE`

## Building the extension on pi 1.0

The template targets pi ≥ 1.0 (devDependencies `@earendil-works/pi-*` `^1.0.1`, `typebox`
`^1.3.27`; peers `"*"`). When you write or review extension code in a generated repo, keep the
conventions the template and its starters model (the README's "Writing extensions for pi 1.0"
section has the full list):

- Pick a starter from `starters/` (event-only, tool-only, command-only, hybrid, ui-only) and copy it
  over `src/index.ts`, ideally after `setup-template` so names are already rewritten. Delete
  `test/extension.test.ts` with it (it tests the default extension, so `pnpm run check` fails
  otherwise), plus the default's now-unused `src/*.ts` helpers and their tests. Delete the
  unused starters and their tests in `test/starters.test.ts` before the first release
  (`test/starters-load.test.ts` follows whatever is left in `starters/`).
- Import only from `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`,
  `@earendil-works/pi-ai` and `typebox`; each imported host package goes in `peerDependencies`
  (`"*"`) and `devDependencies`, never in `dependencies`.
- `ctx.hasUI` (TUI or RPC) gates dialogs and `notify`; `ctx.mode === "tui"` gates
  `ctx.ui.custom()` and other terminal components. Without a UI, report on stderr — never
  stdout.
- Custom components: truncate every line to the render width, build themed strings at render
  time, and use the injected keybindings (`keybindings.matches(data, "tui.select.cancel")`).
- Rebuild session state from `ctx.sessionManager.getBranch()` in `session_start`/`session_tree`;
  start resources there (not in the factory) and release them in `session_shutdown`.
- Tools: always set `promptSnippet`, keep `details` plain JSON, and derive argument types from
  the schema (`Static<typeof schema>`). `renderResult` also draws failed calls (empty `details`),
  so branch on `context.isError`. `tool_result` handlers that replace `content` must return
  `structuredContent` too; returned `details` replace the original. Use `isToolCallEventType` /
  `isBashToolResult` and cover the `powershell` tool when guarding shell commands.
- Use pi's helpers instead of hand-rolled code: `ctx.modelRegistry.complete/streamSimple` for
  LLM calls (never `@earendil-works/pi-ai/compat`), `StringEnum` for string enums, `contentText`
  for the text of a message or tool result, `truncateHead`/`truncateTail` for large output,
  `truncateToWidth`/`visibleWidth` for terminal width, `pi.exec` for one-shot commands,
  `getAgentDir()`/`ctx.cwd` instead of `~/.pi` or `process.cwd()`.

Verify with `pnpm run check`: typecheck, Biome, unit tests, every starter loaded by the real
pi CLI, and the smoke test that loads the package through its `pi` manifest. Both fail on a
startup event handler that throws: pi does not exit non-zero for those, it reports them as
`extension_error` lines on stdout. For UI work, also try `pi -e ./src/index.ts` and `pi -e ./src/index.ts --tui-mode regular` at a narrow width.

## Releasing a generated extension

Generated repos inherit the template's CI (`.github/workflows/ci.yml`), Dependabot config and
Release workflow (`.github/workflows/release.yml` + `.release-it.json`). Releases are cut only from
GitHub Actions:

- Commit with Conventional Commits (`feat:`, `fix:`, `feat!:` …) — the changelog is generated
  from them.
- Run **Actions → Release → Run workflow** (`gh workflow run release.yml -f increment=auto`).
  It runs `pnpm run check`, then release-it bumps the version, updates `CHANGELOG.md`, tags
  `vX.Y.Z`, pushes and creates the GitHub release, and `npm publish` publishes with provenance via
  npm trusted publishing (OIDC). Preview locally with `pnpm release:dry`.
- The workflow refuses to run while `package.json` is still `"private": true` (i.e. before
  `setup-template`).
- First publish only: the package does not exist on npm yet, so trusted publishing cannot be
  configured. Run the workflow once with `bootstrap: true` and a short-lived, publish-only
  `NPM_TOKEN` repository secret, then configure trusted publishing on npmjs.com (GitHub Actions ·
  owner/repo · workflow `release.yml`) and delete the secret.
- Never run `npm publish` or release-it from a laptop.

## Notes

- If the user wants a different template source, pass `--template owner/repo`. The helper skips bootstrap cleanup in that case so it does not remove files from an unrelated template.
- If the target directory already exists locally, stop and ask before overwriting anything.
- If `gh auth status` fails, stop and ask the user to authenticate first.
