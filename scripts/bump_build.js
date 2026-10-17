import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const versionJsonPath = path.join(rootDir, 'version.json');
const versionTsPath = path.join(rootDir, 'src', 'version.ts');
const packageJsonPath = path.join(rootDir, 'package.json');

let versionData = {
  build: 13,
  version: '13',
  buildTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
};

if (fs.existsSync(versionJsonPath)) {
  try {
    versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
    versionData.build = (versionData.build || 0) + 1;
    versionData.version = String(versionData.build);
    versionData.buildTime = new Date().toISOString().replace('T', ' ').substring(0, 16);
  } catch (err) {
    console.warn('Error reading version.json, resetting counter:', err);
  }
}

// Write version.json
fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n', 'utf-8');

// Write src/version.ts
const tsContent = `// Auto-generated build version - DO NOT EDIT MANUALLY
export const APP_VERSION = '${versionData.version}';
export const BUILD_NUMBER = ${versionData.build};
export const BUILD_TIME = '${versionData.buildTime}';
`;
fs.writeFileSync(versionTsPath, tsContent, 'utf-8');

// Update package.json version
try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  pkg.version = versionData.version;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
} catch (err) {
  console.warn('Could not update package.json version:', err);
}

console.log(`[Version Bumper] Updated to version ${versionData.version}`);
