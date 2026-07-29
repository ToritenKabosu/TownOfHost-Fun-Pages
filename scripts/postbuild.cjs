const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');
const srcIndex = path.join(dist, 'index.html');
const targetDir = path.join(dist, 'wiki');
const targetIndex = path.join(targetDir, 'index.html');

if (!fs.existsSync(srcIndex)) {
  console.error('dist/index.html not found; skipping postbuild copy.');
  process.exit(0);
}

if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(srcIndex, targetIndex);
console.log('Copied dist/index.html -> dist/wiki/index.html');
