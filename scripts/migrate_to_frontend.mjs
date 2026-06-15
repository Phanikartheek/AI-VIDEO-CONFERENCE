/**
 * Migrates src/ → frontend/src/ and cleans up.
 * Run once: node scripts/migrate_to_frontend.mjs
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'src');
const destDir = join(root, 'frontend', 'src');

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

if (existsSync(srcDir)) {
  console.log('Copying src/ → frontend/src/...');
  copyDir(srcDir, destDir);
  console.log('Removing old src/...');
  rmSync(srcDir, { recursive: true, force: true });
  console.log('Done! Now update vite.config.ts, tsconfig.json, and index.html.');
} else {
  console.log('src/ not found — already migrated?');
}
