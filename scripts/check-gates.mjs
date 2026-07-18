// Validates a presentation-milestone evidence folder against the gate schema
// in docs/quality-gates.md. The R5 claim is mechanically blocked on this
// passing: incomplete evidence or any scorecard category below the premium
// threshold exits nonzero. Usage: node scripts/check-gates.mjs docs/gates/<milestone>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/check-gates.mjs docs/gates/<milestone>');
  process.exit(1);
}

const REQUIRED = [
  'scorecard.md',
  'fresh-eyes.md',
  'inspector-metrics.md',
  'baselines.md',
  'playtests.md',
  'budget-audit.txt',
];

const CATEGORIES = [
  'City mass and architecture',
  'Ground and street read',
  'Materials',
  'Lighting and image pipeline',
  'Weather and atmosphere',
  'Heroes and agents',
  'Crowds and bodies',
  'Destruction, gore, and VFX',
  'Signage, emissive, and palette identity',
  'Identification and overlays',
];

let failed = false;
function fail(msg) {
  console.error(`GATE FAIL: ${msg}`);
  failed = true;
}

for (const f of REQUIRED) {
  if (!existsSync(join(dir, f))) fail(`missing ${f}`);
}

const scorecardPath = join(dir, 'scorecard.md');
if (existsSync(scorecardPath)) {
  const scorecard = readFileSync(scorecardPath, 'utf8');
  for (const cat of CATEGORIES) {
    if (!scorecard.includes(cat)) fail(`scorecard missing category: ${cat}`);
  }
  if (/below-premium/i.test(scorecard)) {
    fail('scorecard has a category below the premium threshold');
  }
  if (!/docs\/perf\.md/.test(scorecard) && existsSync(join(dir, 'fresh-eyes.md')) && !/docs\/perf\.md/.test(readFileSync(join(dir, 'fresh-eyes.md'), 'utf8'))) {
    fail('no reference to the dated docs/perf.md rows for this milestone');
  }
}

const freshEyesPath = join(dir, 'fresh-eyes.md');
if (existsSync(freshEyesPath) && !/verdict/i.test(readFileSync(freshEyesPath, 'utf8'))) {
  fail('fresh-eyes.md records no verdicts');
}

const auditPath = join(dir, 'budget-audit.txt');
if (existsSync(auditPath) && !/RESULT: PASS/.test(readFileSync(auditPath, 'utf8'))) {
  fail('budget-audit.txt is not a passing audit output');
}

if (failed) {
  console.error('Evidence set incomplete; the milestone (and any R5 claim) stays blocked.');
  process.exit(1);
}
console.log(`Evidence set complete: ${dir}`);
