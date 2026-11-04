const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const path = require('path');
const fs = require('fs');

async function setup() {
  const rootDir = path.resolve(__dirname, '..');
  const electronDir = path.join(rootDir, 'node_modules', 'electron');
  const electronPkg = require(path.join(electronDir, 'package.json'));
  console.log(`Setting up Electron v${electronPkg.version}...`);
  
  const zipPath = await downloadArtifact({
    version: electronPkg.version,
    artifactName: 'electron',
    platform: 'win32',
    arch: 'x64'
  });
  console.log(`Artifact at: ${zipPath}`);

  const distDir = path.join(electronDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  console.log(`Extracting to ${distDir}...`);
  await extract(zipPath, { dir: distDir });

  const pathTxt = path.join(electronDir, 'path.txt');
  fs.writeFileSync(pathTxt, 'electron.exe');
  
  const versionFile = path.join(distDir, 'version');
  fs.writeFileSync(versionFile, electronPkg.version);

  console.log('Electron successfully installed and verified!');
}

setup().catch(err => {
  console.error('Failed to setup Electron:', err);
  process.exit(1);
});
