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

Then remind them to update identifiers in:

- `package.json`
- `src/constants.ts`
- `README.md`
- `LICENSE`

## Notes

- If the user wants a different template source, pass `--template owner/repo`. The helper skips bootstrap cleanup in that case so it does not remove files from an unrelated template.
- If the target directory already exists locally, stop and ask before overwriting anything.
- If `gh auth status` fails, stop and ask the user to authenticate first.
