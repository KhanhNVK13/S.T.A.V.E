const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function installedVersion(name) {
  for (const base of ['frontend/node_modules', 'node_modules']) {
    const file = path.join(base, name, 'package.json');
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8')).version;
    }
  }
  throw new Error(`${name} is not installed`);
}

const pairs = [
  ['lightningcss', 'lightningcss-linux-x64-gnu'],
  ['@tailwindcss/oxide', '@tailwindcss/oxide-linux-x64-gnu'],
];

const specs = pairs.map(
  ([base, native]) => `${native}@${installedVersion(base)}`,
);

execSync(`npm install --no-save --no-package-lock ${specs.join(' ')}`, {
  stdio: 'inherit',
});
