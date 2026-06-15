#!/usr/bin/env node
/**
 * Build wrapper: runs ML training pipeline, then vite build.
 */
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

console.log('\n🧠 Running ML training pipeline...\n');
try {
  execSync(`node ${join(__dirname, 'generate_ml_results.mjs')}`, { stdio: 'inherit', cwd: root });
} catch (e) {
  console.error('ML pipeline failed:', e.message);
}

console.log('\n🔨 Running vite build...\n');
execSync('npx vite build', { stdio: 'inherit', cwd: root });
