# openlint-language-server

A language server for [OpenLint](https://openlint.org). It runs the OpenLint engine and the CLI's own ruleset loader, so an editor reports what `openlint lint` reports in CI.

**Status: early prototype, not published.** It does one thing: lint open YAML and JSON files and report the results as diagnostics. See [PLAN.md](PLAN.md).

## Try it

```sh
npm install
npm test       # includes a test that the server's results match the CLI's
npm run build
```

Point any LSP client at `bin/openlint-language-server.js --stdio`. For example, in Neovim 0.11:

```lua
vim.lsp.config('openlint', {
  cmd = { 'node', '/path/to/language-server/bin/openlint-language-server.js', '--stdio' },
  filetypes = { 'yaml', 'json' },
  root_markers = { '.openlint.yaml', '.spectral.yaml', '.git' },
})
vim.lsp.enable('openlint')
```

## How it behaves

- **Ruleset:** the first default-named file (`.openlint.yaml`, `.spectral.yaml`, …) at the workspace root, or the `ruleset` initialization option. As with the CLI, there's no built-in default: with no ruleset it warns once and reports nothing.
- **Unrecognized documents:** skipped without a warning (`ignoreUnknownFormat`), so ordinary YAML files stay quiet.
- **Rule links:** diagnostics from built-in rules link to their page on [rules.openlint.org](https://rules.openlint.org).

## License

Apache 2.0.
