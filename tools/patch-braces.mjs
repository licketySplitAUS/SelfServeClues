// Temporary development-tool mitigation until upstream publishes a fix.
// Keep npm's advisory visible; do not misrepresent this as an upstream update.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const marker = 'LICKETY_BRACES_DEPTH_LIMIT';
for (const name of Object.keys(lock.packages).filter(name => name.endsWith('/braces'))) {
  const file = path.join(root, name, 'lib/parse.js');
  if (!fs.existsSync(file)) continue;
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes(marker)) continue;
  const normalized = source.replace(/\r\n/g, '\n');
  const hash = createHash('sha256').update(normalized).digest('hex');
  if (hash !== 'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310') throw Error('braces source changed: reassess the temporary depth mitigation.');
  const anchor = '  const opts = options || {};';
  const guard = `  // ${marker}: bound AST recursion before compile/expand/stringify.
  let safeDepth = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '\\\\') { i++; continue; }
    if (input[i] === '{' && ++safeDepth > 128) throw new SyntaxError('Brace nesting exceeds the safe depth limit.');
    if (input[i] === '}') safeDepth = Math.max(0, safeDepth - 1);
  }
`;
  if (!source.includes(anchor)) throw Error('braces parser anchor missing.');
  fs.writeFileSync(file, source.replace(anchor, guard + '\n' + anchor));
}
console.log('Applied reviewed braces depth limit to development tooling.');
