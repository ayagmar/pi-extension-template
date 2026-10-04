# Starter patterns

Use these as drop-in starting points for `src/index.ts`.

- `event-only.ts` → listeners/interceptors/guards: confirms dangerous `bash`/`powershell`
  commands (`tool_call`) and redacts secrets from shell results, `structuredContent` included
  (`tool_result`), plus a shortcut
- `tool-only.ts` → model-callable tool with custom rendering, plus result post-processing via
  `tool_result` that keeps the tool's `details`
- `command-only.ts` → user slash UX, including a small interactive `select` flow and shortcut
- `hybrid.ts` → event + command + tool + shortcut in one file
- `ui-only.ts` → status line, widget, custom dashboard via `ctx.ui.custom()` (TUI only, with a
  `notify` fallback for RPC/print), shortcut

All starters target pi 1.0: they gate dialogs on `ctx.hasUI`, terminal components on
`ctx.mode === "tui"`, and never write to stdout. `test/starters.test.ts` covers their behavior and
`test/starters-load.test.ts` loads each file with the real pi CLI.

Quick copy examples:

```bash
cp starters/event-only.ts src/index.ts
# or
cp starters/tool-only.ts src/index.ts
```

Then delete `test/extension.test.ts` (it tests the default extension you replaced) and run:

```bash
pnpm run check
```

After you pick a starter for the real extension, delete the unused starter files and their tests
in `test/starters.test.ts` (imports included, or `pnpm run check` fails to find the deleted
modules). `test/starters-load.test.ts` follows whatever remains in `starters/`.

## Setup order

If you copy a starter into `src/index.ts` **before** running `pnpm run setup-template`,
the new file keeps the default `myext` names. Either:

- Run `setup-template` first, then copy the starter
- Or copy the starter first, then run `setup-template` and manually update names in `src/index.ts`
