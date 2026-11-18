// The promise of this server: the same results as the CLI, from the same engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = createRequire(import.meta.url).resolve('openlint/dist/index.js');

function cliResults(fixture) {
  let out;
  try {
    out = execFileSync(process.execPath, [cli, 'lint', '-f', 'json', 'openapi.yaml'], { cwd: fixture, encoding: 'utf8' });
  } catch (e) {
    out = e.stdout; // exits non-zero when it finds errors
  }
  return JSON.parse(out);
}

function serverDiagnostics(fixture) {
  const file = join(fixture, 'openapi.yaml');
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [join(here, '../bin/openlint-language-server.js'), '--stdio'], { cwd: '/' });
    const timer = setTimeout(() => { server.kill(); reject(new Error('no diagnostics within 60s')); }, 60000);
    const uri = pathToFileURL(file).href;
    const send = m => {
      const body = JSON.stringify({ jsonrpc: '2.0', ...m });
      server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    };
    let buf = Buffer.alloc(0);
    server.stdout.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const len = Number(/Content-Length: (\d+)/.exec(buf.subarray(0, end).toString())[1]);
        if (buf.length < end + 4 + len) return;
        const msg = JSON.parse(buf.subarray(end + 4, end + 4 + len).toString());
        buf = buf.subarray(end + 4 + len);
        if (msg.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'yaml', version: 1, text: readFileSync(file, 'utf8') } } });
        }
        if (msg.method === 'textDocument/publishDiagnostics') {
          clearTimeout(timer);
          server.kill();
          resolve(msg.params.diagnostics);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { processId: null, capabilities: {}, rootUri: pathToFileURL(fixture).href } });
  });
}

const key = r => `${r.code}|${r.severity}|${r.message}|${r.range.start.line}:${r.range.start.character}-${r.range.end.line}:${r.range.end.character}`;

// spectral:oas (frozen) and openlint:openapi (evolving) resolve through different packages since 1.2.
for (const [name, dir] of [['spectral:oas', 'fixture'], ['openlint:openapi', 'fixture-openlint']]) {
  test(`the server reports exactly what the CLI reports (${name})`, async () => {
    const fixture = join(here, dir);
    const expected = cliResults(fixture);
    const actual = await serverDiagnostics(fixture);
    assert.ok(expected.length >= 3, 'the fixture should produce findings');
    assert.deepEqual(
      actual.map(d => key({ ...d, severity: d.severity - 1 })).sort(),
      expected.map(key).sort(),
    );
  });
}

test('built-in rules link to the registry, custom rules do not', async () => {
  const actual = await serverDiagnostics(join(here, 'fixture'));
  const by = code => actual.find(d => d.code === code);
  assert.equal(by('info-contact').codeDescription.href, 'https://rules.openlint.org/info-contact/');
  assert.equal(by('has-summary').codeDescription, undefined);
});
