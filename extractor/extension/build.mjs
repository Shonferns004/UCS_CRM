import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outdir = path.join(root, 'release');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    content: path.join(root, 'src/content.ts'),
    background: path.join(root, 'src/background.ts'),
    sidepanel: path.join(root, 'src/sidepanel/index.ts')
  },
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  outdir,
  logLevel: 'info',
  legalComments: 'none'
});

await cp(path.join(root, 'manifest.json'), path.join(outdir, 'manifest.json'));
await cp(path.join(root, 'src/sidepanel/index.html'), path.join(outdir, 'sidepanel.html'));
await cp(path.join(root, 'src/sidepanel/style.css'), path.join(outdir, 'sidepanel.css'));
await cp(path.join(root, 'assets/icons'), path.join(outdir, 'icons'), { recursive: true });

console.log(`\nExtension built into ${path.relative(root, outdir)}\\`);
console.log('Load it at chrome://extensions -> Developer mode -> Load unpacked.');
