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

if (!fs.existsSync(targetIndex)) {
  fs.copyFileSync(srcIndex, targetIndex);
  // Adjust asset paths in the copied wiki file so it references ../assets/ instead of ./assets/
  try {
    let content = fs.readFileSync(targetIndex, 'utf8');
    content = content.replace(/\.\/assets\//g, '../assets/');
    fs.writeFileSync(targetIndex, content, 'utf8');
    console.log('Copied dist/index.html -> dist/wiki/index.html (adjusted asset paths)');
  } catch (e) {
    console.warn('Copied file but failed to adjust asset paths:', e && e.message ? e.message : e);
  }
} else {
  console.log('dist/wiki/index.html already exists; skipping postbuild copy.');
}

// Generate fallback paths for confirm-redirect and comfirm-redirect
const redirectSrc = path.join(dist, 'confirm-redirect.html');
if (fs.existsSync(redirectSrc)) {
  const dirs = [
    path.join(dist, 'confirm-redirect'),
    path.join(dist, 'comfirm-redirect')
  ];
  dirs.forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    fs.copyFileSync(redirectSrc, path.join(d, 'index.html'));
  });
  fs.copyFileSync(redirectSrc, path.join(dist, 'comfirm-redirect.html'));
  console.log('Generated compatibility routes for confirm-redirect & comfirm-redirect');
}
