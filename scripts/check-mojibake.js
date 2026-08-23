const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INCLUDE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.sql', '.md', '.html', '.css']);
const SKIP_DIRS = new Set(['.git', '.expo', '.vercel', 'dist', 'node_modules']);

const mojibakePattern =
  /\u0420[\u00a0-\u00bf\u0402-\u040f\u0452-\u045f]|\u0421[\u00a0-\u00bf\u0402-\u040f\u0452-\u045f]|\u00d0[\u0080-\u00bf]|\u00d1[\u0080-\u00bf]|\?{3,}/g;

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!INCLUDE_EXTENSIONS.has(path.extname(entry.name))) continue;

    const text = fs.readFileSync(fullPath, 'utf8');
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      const matches = line.match(mojibakePattern);
      if (!matches) return;

      findings.push({
        file: path.relative(ROOT, fullPath),
        line: index + 1,
        sample: line.trim().slice(0, 180),
      });
    });
  }
}

walk(ROOT);

if (findings.length > 0) {
  console.error('Mojibake-like text found. Fix encoding before build:');
  for (const finding of findings.slice(0, 30)) {
    console.error(`${finding.file}:${finding.line} ${finding.sample}`);
  }
  if (findings.length > 30) {
    console.error(`...and ${findings.length - 30} more`);
  }
  process.exit(1);
}
