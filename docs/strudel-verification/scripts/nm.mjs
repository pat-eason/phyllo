// helper: resolve package entry inside pkgs/node_modules
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const PKGS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../pkgs');
const req = createRequire(path.join(PKGS, 'package.json'));
export const imp = (name) => {
  const pj = req(name + '/package.json');
  const dir = path.dirname(req.resolve(name + '/package.json'));
  return import(pathToFileURL(path.join(dir, pj.module || pj.main)).href);
};
