import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'extension', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const referencedFiles = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...manifest.content_scripts.flatMap(script => script.js || [])
].filter(Boolean);

for (const file of referencedFiles) await access(path.join(root, 'extension', file));

if (manifest.manifest_version !== 3) throw new Error('Canopy must use Manifest V3.');
if (!manifest.permissions.includes('sidePanel')) throw new Error('The side-panel permission is required.');
if (!manifest.permissions.includes('tabGroups')) throw new Error('The tab-groups permission is required.');
for (const [name, command] of Object.entries(manifest.commands || {})) {
  if (!command.description?.trim()) throw new Error(`Command ${name} requires a description.`);
}
if (manifest.content_security_policy?.extension_pages?.includes('http')) throw new Error('Remote extension code is not allowed.');

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const packages = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
if ('electron' in packages || 'electron-builder' in packages) throw new Error('Electron dependencies are not allowed.');

console.log(`Validated Canopy ${manifest.version} (${referencedFiles.length} extension entry points).`);
