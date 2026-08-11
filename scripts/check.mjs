import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const sourceDirectories = ['bin', 'lib', 'scripts', 'test'];
const javascriptFiles = [];

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectJavaScript(entryPath);
    if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) javascriptFiles.push(entryPath);
  }
}

for (const directory of sourceDirectories) {
  await collectJavaScript(path.join(repositoryRoot, directory));
}

for (const filePath of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const jsonFile of ['package.json', 'package-lock.json']) {
  JSON.parse(await readFile(path.join(repositoryRoot, jsonFile), 'utf8'));
}

const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
for (const executable of Object.values(packageJson.bin || {})) {
  await access(path.join(repositoryRoot, executable), constants.R_OK);
}

console.log(`Checked ${javascriptFiles.length} JavaScript files and package metadata.`);
