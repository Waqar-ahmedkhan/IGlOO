import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { stripTypeScriptTypes } from 'node:module';

// Run after `npm run build -- --manifest` to inspect the actual production import graph.
const manifest = JSON.parse(await fs.readFile('dist/.vite/manifest.json', 'utf8'));
const initial = new Set();
function visit(key) {
  if (initial.has(key)) return;
  initial.add(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
visit('index.html');
const atmosphere = 'src/scenes/AtmosphericScene.tsx';
assert(manifest[atmosphere]?.isDynamicEntry, 'The portfolio and portal must load as a separate production entry');
assert(!initial.has(atmosphere), 'The hero must not wait for later scenes to download');
const fonts = manifest['index.html'].assets.filter(file => /\.woff2?$/.test(file));
assert(fonts.length > 0 && fonts.every(file => file.includes('-latin-')), 'Only used font subsets should ship');
let initialBytes = 0;
for (const key of initial) initialBytes += gzipSync(await fs.readFile(`dist/${manifest[key].file}`)).length;
console.log(`Production startup: ${(initialBytes / 1024).toFixed(1)} KiB gzip JS; ${fonts.length} font assets; atmosphere deferred.`);

// Confirm that the gust field remains bounded and its drift stays smooth during long sessions.
const windSource = stripTypeScriptTypes(await fs.readFile('src/hero/wind.ts', 'utf8'));
const { sampleWind } = await import(`data:text/javascript,${encodeURIComponent(windSource)}`);
for (let second = 0; second <= 7200; second += 3) {
  const wind = sampleWind(second, false);
  const derivative = (sampleWind(second + 0.001, false).drift - sampleWind(second - 0.001, false).drift) / 0.002;
  assert(wind.strength >= 0.35 && wind.strength <= 0.8, 'Gust strength must stay restrained');
  assert(Math.abs(derivative - wind.strength) < 0.000001, 'Wind must not accelerate with accumulated elapsed time');
  assert.deepEqual(sampleWind(second, true), { time: 0, gust: 0, strength: 0, drift: 0 }, 'Reduced motion must freeze weather');
}
console.log('PASS: deferred scene imports, Latin font subsets, two-hour wind continuity and reduced motion.');
