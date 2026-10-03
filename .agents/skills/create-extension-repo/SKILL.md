---
name: create-extension-repo
description: Create a new GitHub repository from this template with gh CLI, clone it locally, remove this template's bootstrap skill from the generated repo, and clean package.json to stop shipping the skill downstream. Use when asked to make a new extension repo from this template.
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
4. Removes the generated repo's `.agents/skills/` directory.
5. Removes leftover repo-local bootstrap skill file entries from the generated repo's `package.json` if present.
6. Creates and pushes a cleanup commit so the generated repo does not keep this bootstrap skill.

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
