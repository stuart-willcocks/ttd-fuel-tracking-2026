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

// Write version.json and public/version.json
fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n', 'utf-8');
const publicVersionJsonPath = path.join(rootDir, 'public', 'version.json');
try {
  fs.writeFileSync(publicVersionJsonPath, JSON.stringify(versionData, null, 2) + '\n', 'utf-8');
} catch {
  // Ignore if public directory not found
}
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  try {
    fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(versionData, null, 2) + '\n', 'utf-8');
  } catch { }
}

import { execSync } from 'child_process';

let branch = '';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  branch = process.env.VERCEL_GIT_COMMIT_REF || '';
}
const isStaging = branch === 'staging' || process.env.VERCEL_ENV === 'preview' || Boolean(process.env.VITE_IS_STAGING);

// Write src/version.ts
const tsContent = `// Auto-generated build version - DO NOT EDIT MANUALLY
export const APP_VERSION = '${versionData.version}';
export const BUILD_NUMBER = ${versionData.build};
export const BUILD_TIME = '${versionData.buildTime}';
export const GIT_BRANCH = '${branch}';
export const IS_STAGING = ${isStaging};

export function getIsStaging(): boolean {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'ttd-fuel-tracking-2026.vercel.app') {
      return false;
    }
    if (host.includes('staging') || host.includes('preview') || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) {
      return true;
    }
  }
  return IS_STAGING;
}

export function getReportedAppVersion(versionOverride?: string | null): string {
  const base = String(versionOverride || APP_VERSION).trim().replace(/\\s*\\(staging\\)\\s*$/i, '');
  return getIsStaging() ? \`\${base} (staging)\` : base;
}
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
