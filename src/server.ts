import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { oas, asyncapi, arazzo } from '@openlint/openlint-rulesets';
import type { IRuleResult } from '@openlint/openlint-core';
import { Engine, findRulesetFile } from './engine';

const DEBOUNCE_MS = 200;
const LINTABLE = /\.(ya?ml|json)$/i;
const RULESET_FILE = /(^|[\\/])\.?(openlint|spectral)\.(ya?ml|json|m?js)$/;
const BUILT_IN = new Set(
  [oas, asyncapi, arazzo].flatMap(ruleset => Object.keys((ruleset as { rules: object }).rules)),
);

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const engine = new Engine();
const timers = new Map<string, NodeJS.Timeout>();
const warned = new Set<string>();
const generations = new Map<string, number>();
let roots: string[] = [];
let configuredRuleset: string | undefined;
let canWatchFiles = false;

connection.onInitialize(params => {
  roots = (params.workspaceFolders ?? []).map(folder => fileURLToPath(folder.uri));
  if (roots.length === 0 && params.rootUri) roots = [fileURLToPath(params.rootUri)];
  configuredRuleset = (params.initializationOptions as { ruleset?: string } | undefined)?.ruleset;
  canWatchFiles = params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;
  return {
    capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
    serverInfo: { name: 'openlint-language-server' },
  };
});

connection.onInitialized(() => {
  if (canWatchFiles) {
    void connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [{ globPattern: '**/{.openlint,.spectral,openlint,spectral}.{yaml,yml,json,js,mjs}' }],
    });
  }
});

// Editing a default-named ruleset changes every open document's results.
connection.onDidChangeWatchedFiles(() => {
  engine.clear();
  warned.clear();
  documents.all().forEach(schedule);
});

documents.onDidOpen(({ document }) => schedule(document));
documents.onDidChangeContent(({ document }) => schedule(document));
documents.onDidClose(({ document }) => {
  clearTimeout(timers.get(document.uri));
  timers.delete(document.uri);
  generations.delete(document.uri);
  void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

function schedule(document: TextDocument): void {
  clearTimeout(timers.get(document.uri));
  timers.set(document.uri, setTimeout(() => void lint(document), DEBOUNCE_MS));
}

function rulesetFor(file: string): string | undefined {
  if (configuredRuleset !== undefined) {
    if (path.isAbsolute(configuredRuleset)) return configuredRuleset;
    return path.resolve(roots[0] ?? path.dirname(file), configuredRuleset);
  }
  const root = roots.find(r => file.startsWith(r + path.sep));
  return findRulesetFile(root ?? path.dirname(file));
}

async function lint(document: TextDocument): Promise<void> {
  if (!document.uri.startsWith('file:')) return;
  const file = fileURLToPath(document.uri);
  if (!LINTABLE.test(file) || RULESET_FILE.test(file)) return;

  const generation = (generations.get(document.uri) ?? 0) + 1;
  generations.set(document.uri, generation);

  try {
    const rulesetFile = rulesetFor(file);
    if (rulesetFile === undefined) {
      // Like the CLI, there is no default ruleset: nothing to lint against.
      warnOnce(file, 'OpenLint: no ruleset found. Add .openlint.yaml to the workspace, or set the ruleset option.');
      await connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
      return;
    }
    const results = await engine.lint(document.getText(), file, rulesetFile);
    if (generations.get(document.uri) !== generation) return;
    await connection.sendDiagnostics({
      uri: document.uri,
      version: document.version,
      diagnostics: results.filter(r => r.source === undefined || r.source === file).map(toDiagnostic),
    });
  } catch (error) {
    warnOnce(file, `OpenLint: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function warnOnce(key: string, message: string): void {
  const id = `${key}\0${message}`;
  if (warned.has(id)) return;
  warned.add(id);
  void connection.window.showWarningMessage(message);
}

function toDiagnostic(result: IRuleResult): Diagnostic {
  const code = String(result.code);
  return {
    range: result.range,
    message: result.message,
    severity: (result.severity + 1) as DiagnosticSeverity,
    code,
    source: 'OpenLint',
    ...(BUILT_IN.has(code) && {
      codeDescription: { href: `https://rules.openlint.org/${encodeURIComponent(code).replace(/%24/g, '$')}/` },
    }),
  };
}

documents.listen(connection);
connection.listen();
