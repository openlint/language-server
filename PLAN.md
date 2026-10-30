# Plan

**Goal:** every editor gets the results CI gets, by running the OpenLint engine behind the Language Server Protocol. Anything calling itself OpenLint in an editor must run the engine or pass the [conformance suite](https://github.com/openlint/spec/tree/main/v1/conformance).

Discussion: [openlint discussion #9](https://github.com/orgs/openlint/discussions/9).

## Milestone 0: prototype (this repo today)

- [x] Diagnostics over stdio from the engine, using the CLI's ruleset loader and resolver
- [x] A test that compares the server's results with the CLI's on a fixture
- [x] Links from built-in rules to rules.openlint.org
- [ ] Decide on the repo's name and home

## Milestone 1: usable in editors

- [ ] Tested setup for VS Code, Neovim, IntelliJ (LSP4IJ), Zed and Helix
- [ ] Multi-root workspaces: a ruleset per folder
- [ ] Reload when an extended ruleset or a configured ruleset changes (today only default-named files are watched, and only by clients that support it)
- [ ] Show ruleset errors at the ruleset file, not only as a pop-up
- [ ] Results in other files: `$ref`'d documents (dropped for now)
- [ ] Run the parity test over a wider set of rulesets, including custom functions and `extends` by URL
- [ ] Publish to npm

## Milestone 2: VS Code on the server

Extension v2 becomes a client of this server. The extension's features must survive, and these are the reasons it avoided LSP:

- [ ] VS Code Web: a browser build of the server. The CLI's loader uses Node, so this needs the extension's ruleset loader or a shared one
- [ ] Authenticated rulesets and loaders, with secrets passed from the client
- [ ] Diff filtering: on the client, or on the server if other editors want it

## Milestone 3: what only an OpenLint server can do

- [ ] Editor support in ruleset files: schema validation, rule-name and function-option completion, `#alias` resolution, a clear message for the YAML `[*]` error ([openlint#16](https://github.com/openlint/openlint/issues/16))
- [ ] Hover on a diagnostic: why the rule is on, at what severity, from which ruleset
- [ ] Quick fixes for mechanical rules
- [ ] File-type neutral, so Markdown and agent-skill linting works when the engine supports it

## Engine API

The server imports `getRuleset` and `getResolver` from `openlint/dist/services/...`, which aren't public API and can change in any release, so it pins an exact version. Ask the toolbox to export a supported "load a ruleset" function, which the extension's loader could use too. That's the first request to take to openlint/openlint.

## Not in scope

Navigation, rename and hover for OpenAPI. Other servers already do those well, and editors can run them alongside this one. If another engine passes the conformance suite, it qualifies for diagnostics too.

## Open questions

- Should this live in openlint/openlint as a package, or its own repo? It's its own repo for now so it can move fast; a package would keep it in step with the engine.
- Who else maintains it? Kin leads and coordinates. Dimitri and Joost offered to look at a language server; Ivan owns the code milestone 2 depends on.
