// Copies the static web app into www/, the folder Capacitor packages into the APK.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const entries = ['index.html', 'manifest.webmanifest', 'css', 'js'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const e of entries) {
  fs.cpSync(path.join(root, e), path.join(out, e), { recursive: true });
}
console.log(`Copied ${entries.join(', ')} to www/`);
