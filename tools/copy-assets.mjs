import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRS = [path.join('web', 'assets')];

for (const relative of ASSET_DIRS) {
  const from = path.join(root, 'src', relative);
  const to = path.join(root, 'dist', relative);
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`copied ${relative}`);
}
