// The only file that touches the engine. It reuses the CLI's own ruleset loader
// and resolver, so a document gets the same results here as from `openlint lint`.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Document, OpenLint, Ruleset } from '@openlint/openlint-core';
import type { IRuleResult } from '@openlint/openlint-core';
import { Yaml } from '@openlint/openlint-parsers';
// No public API for these yet: see "Engine API" in PLAN.md.
import { getRuleset } from 'openlint/dist/services/linter/utils/getRuleset';
import { getResolver } from 'openlint/dist/services/linter/utils/getResolver';

export function findRulesetFile(dir: string): string | undefined {
  // Same discovery as the CLI: the first default-named file in this directory, no parents.
  const name = fs.readdirSync(dir).find(file => Ruleset.isDefaultRulesetFile(file));
  return name === undefined ? undefined : path.join(dir, name);
}

export class Engine {
  private readonly linters = new Map<string, OpenLint>();

  async lint(text: string, source: string, rulesetFile: string): Promise<IRuleResult[]> {
    const openlint = await this.linter(rulesetFile);
    return openlint.run(new Document(text, Yaml, source), { ignoreUnknownFormat: true });
  }

  clear(): void {
    this.linters.clear();
  }

  private async linter(rulesetFile: string): Promise<OpenLint> {
    let openlint = this.linters.get(rulesetFile);
    if (openlint === undefined) {
      openlint = new OpenLint({ resolver: getResolver(undefined) });
      openlint.setRuleset(await getRuleset(rulesetFile));
      this.linters.set(rulesetFile, openlint);
    }
    return openlint;
  }
}
