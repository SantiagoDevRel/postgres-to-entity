import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vocabularyProblem } from '../tools/vocabulary.mjs';

const guidance = ['README.md', 'AGENTS.md', 'sample/README.md', 'sample/AGENTS.md', 'sample/index.html'];
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]);
const source = [...walk('src').filter(p => p.endsWith('.ts') && !p.endsWith('.test.ts')), ...walk('sample/src').filter(p => !p.endsWith('.css')), ...walk('sample/api'), ...walk('sample/shared')];
for (const file of [...guidance, ...source]) {
  const text = readFileSync(file, 'utf8');
  const brand = vocabularyProblem(text);
  if (brand) throw new Error(file + ': ' + brand);
  if (/Tiramisu|7738577|0\.8\.[\dx]|arkiv-entity-model\/2|jsonToPay[l]oad/.test(text)) throw new Error(file + ': earlier network or model guidance');
  if (text.split('\n').some(line => /[\t ]+$/.test(line))) throw new Error(file + ': trailing whitespace');
}
console.log('Current guidance, source vocabulary and whitespace checks passed.');
