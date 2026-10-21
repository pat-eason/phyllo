// resolve hook: for bare specifiers, prefer package.json "module" field (bundler semantics)
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const PKGS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pkgs/node_modules');
export async function resolve(spec, ctx, next) {
  if (!spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:') && !spec.startsWith('file:')) {
    const parts = spec.split('/');
    const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const sub = parts.slice(spec.startsWith('@') ? 2 : 1).join('/');
    const dir = path.join(PKGS, name);
    const pj = path.join(dir, 'package.json');
    if (!sub && existsSync(pj)) {
      const p = JSON.parse(readFileSync(pj, 'utf8'));
      if (p.module && !p.exports) return { url: pathToFileURL(path.join(dir, p.module)).href, shortCircuit: true, format: 'module' };
    }
    // otherwise resolve as if imported from inside pkgs/
    return next(spec, { ...ctx, parentURL: pathToFileURL(path.join(PKGS, '..', 'package.json')).href });
  }
  return next(spec, ctx);
}
