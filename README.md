# Pi Extension Template

A practical starter for building Pi extensions that are easy to ship, test, and maintain.

## What you get

- Strict TypeScript + Biome
- Unit tests + smoke test
- GitHub Actions CI with individual step reporting
- A minimal default extension in `src/index.ts`
- Multiple architecture starters in `starters/`
- Pi 0.63.x-compatible extension patterns

Biome is configured to keep the previous template guardrails around explicit `any`, type-only imports, floating promises, unused variables, and namespace imports, while also adding unused-import, CommonJS, and `node:` builtin import checks.

## Quick start

1. Click **Use this template** on GitHub.
2. Clone your new repo.
3. Install dependencies.

```bash
pnpm install
```

4. Run the bootstrap script once.

```bash
pnpm run setup-template
```

This updates `src/constants.ts`, `package.json`, and starter files with your extension name.

5. Finish the rename pass manually.

## Post-clone rename and cleanup

`setup-template` handles the common identifiers, but it does **not** finish the repo for you.
Before your first real release, update or remove the template leftovers below.

### Rename checklist

- Rename the GitHub repo / local directory to your real project name.
- Review `package.json`:
  - `name`
  - `description`
  - `pi.image` / `pi.video`
- Review `src/constants.ts`:
  - `EXTENSION_NAME`
  - `EXTENSION_COMMAND`
  - `TOOL_NAME`
  - `STATE_ENTRY_TYPE`
- Update `README.md` title and usage examples if they still describe a template.
- Update `LICENSE` with your actual name or organization.

### Template-only files and scripts

After you finish renaming, these are usually not meant to ship forever:

- `scripts/setup.mjs`
- `pnpm run setup-template`
- `.agents/skills/` (the repo-local bootstrap skill folder, if you no longer need it)

Remove them once the extension has been renamed and you no longer need template bootstrapping.
Also delete unused starter files and starter-specific tests before publishing a real extension package.

## Repo-local bootstrap skill

This template includes a repo-local skill at `.agents/skills/create-extension-repo`.

Use `/skill:create-extension-repo` from this template repo to create a fresh GitHub repo with `gh repo create --template`, clone it locally, and remove the bootstrap skill folder from the generated repo so the child repo does not keep this template-only helper.

## Verify the template

Run the full check suite:

```bash
pnpm run check
```

## Load it in Pi

For a quick smoke test:

```bash
pi -e ./src/index.ts
```

For normal development, prefer auto-discovery so `/reload` works:

- `~/.pi/agent/extensions/` (global)
- `.pi/extensions/` (project)

## Choose your extension pattern

Not all Pi extensions need commands or tools. Pick a starter that matches your use case:

- `starters/event-only.ts` → listeners/interceptors/guards (`tool_call`, `tool_result`, shortcut)
- `starters/tool-only.ts` → model-callable tools + result interception + custom rendering
- `starters/command-only.ts` → slash command UX + a small interactive picker + shortcut
- `starters/hybrid.ts` → command + tool + event hooks + shortcut
- `starters/ui-only.ts` → status line, widget, custom dashboard via `ctx.ui.custom()`, shortcut

Replace the default `src/index.ts` with your chosen starter:

```bash
cp starters/event-only.ts src/index.ts
pnpm run check
```

If you copy a starter into `src/index.ts` **before** running `setup-template`, the copied file keeps the default `myext` names. Either:

- Run `setup-template` first, then copy the starter
- Or copy the starter first, then run setup and manually update names in `src/index.ts`

## Install and manage with current Pi

Pi has built-in package management now. Use these commands directly:

```bash
pi install ./relative/path/to/your-extension-repo
pi install /absolute/path/to/your-extension-repo
pi install git:github.com/yourusername/your-repo
pi install npm:your-package-name

pi remove npm:your-package-name
pi update
pi config
```

If Pi is already running, use `/reload` after local changes.

**Do not use `pi-extmgr` or `/extensions install`.** They are legacy workflow docs and are not needed on current Pi.

## Customize

The bootstrap script updates most identifiers automatically. To customize manually, review:

### `src/constants.ts`

- `EXTENSION_NAME`
- `EXTENSION_COMMAND`
- `TOOL_NAME`
- `STATE_ENTRY_TYPE`

### `package.json`

- `name`
- `description`
- `pi.image` / `pi.video`

### Custom tools on modern Pi

If you add a model-callable tool, give it a `promptSnippet`. Current Pi only includes custom tools in the default `Available tools` prompt section when they opt in with `promptSnippet`.

## Scripts

```bash
pnpm run setup-template
pnpm run typecheck
pnpm run test
pnpm run smoke-test
pnpm run lint
pnpm run lint:fix
pnpm run format
pnpm run format:check
pnpm run check
```

## Testing notes

- `test/commands.test.ts`, `test/tool.test.ts`, `test/extension.test.ts` cover core template logic
- `test/starters.test.ts` validates starter behavior patterns

## Docs worth reading

- [extensions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [packages.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
- [tui.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/tui.md)
- [keybindings.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/keybindings.md)
- [examples/extensions](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions)

## Share your extension

Add the `pi-package` keyword to `package.json` and publish to npm.

For gallery previews, set `pi.image` or `pi.video` in `package.json`.
See [packages.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md#gallery-metadata).

Package gallery: [shittycodingagent.ai/packages](https://shittycodingagent.ai/packages)

## License

MIT
