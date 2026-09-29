// scripts/test-profiles.js
// Headless test of the Monitor's Profile lookup (electron/profiles.js) — the
// main-process half of what the views show — against a small in-file Registry.
// No network, no Electron. The stamped resolver copy is checked first: an edited
// copy of cp-resolver.js fails here.
//
// Usage: npm run test:profiles

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createProfiles } from '../electron/profiles.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (detail || '')));
  if (!cond) failed++;
};

// The stamped copy is as stamped
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-cp-resolver.cjs'), path.join(ROOT, 'electron/cp-resolver.js')], { stdio: 'pipe' });
  check('cp-resolver.js matches its stamp', true);
} catch (e) {
  check('cp-resolver.js matches its stamp', false, String(e.stderr || e.message).trim());
}

// ---- a tiny Registry: canon's shapes, two Profiles --------------------------
const prop = (Name, Mandatory, Propagate, extra) => Object.assign({ Name, Mandatory, Propagate }, extra || {});
const contract = (title, provider, consumer, P, C) => JSON.stringify({ Header: { Title: title, Provider: provider, Consumer: consumer }, Properties: { Provider: P, Consumer: C } });
const DOCS = {
  'padi.light': { versions: [{ version: 1, status: 'published' }] },
  'padi.light:1': contract('Simple light control profile', 'A Controller', 'A Light being controlled',
    [prop('sOut', 'yes', 'yes', { Description: 'output state' }), prop('sLabel', 'yes', 'yes')], [prop('cState', 'yes', 'yes'), prop('cLabel', 'yes', 'yes')]),
  'padi.lighting': { versions: [{ version: 1, status: 'deprecated' }, { version: 2, status: 'published' }] },
  'padi.lighting:1': contract('Lighting Control', 'Controller', 'Luminaire', [prop('level', 'yes', 'yes')], [prop('actual', 'yes', 'yes')]),
  'padi.lighting:2': contract('Lighting Control', 'Controller', 'Luminaire',
    [prop('level', 'yes', 'yes', { Default: '0' }), prop('color', 'no', 'yes'), prop('fade', 'no', 'yes')], [prop('actual', 'yes', 'yes'), prop('power', 'no', 'no')]),
  'padi.appliance': { versions: [] },
};
let offline = false;
const fakeFetch = async (url) => {
  if (offline) throw new TypeError('fetch failed');
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const d = DOCS[name];
  if (d === undefined) return { status: 404, headers: { get: () => null }, text: async () => '{}' };
  const body = typeof d === 'string' ? d : JSON.stringify(Object.assign({ name }, d));
  return { status: 200, headers: { get: () => null }, text: async () => body };
};

const P = createProfiles({ fetch: fakeFetch, retryGap: 30, absentTtl: 0 });

// M1: padi.light, no recorded version -> v1, properties with roles and descriptions
let r = await P.getProfile('padi.light');
check('M1 padi.light: v1, roles from the contract', r.ok && r.profile.version === 1 &&
  r.profile.properties.sOut.role === 'provider' && r.profile.properties.cState.role === 'consumer' &&
  r.profile.properties.sOut.description === 'output state', JSON.stringify(r));

// M2: padi.lighting, no recorded version -> v2 and its role names
r = await P.getProfile('padi.lighting');
check('M2 padi.lighting with no version: v2, Controller / Luminaire, five properties',
  r.ok && r.profile.version === 2 && r.profile.roles.provider === 'Controller' && r.profile.roles.consumer === 'Luminaire' &&
  Object.keys(r.profile.properties).join() === 'level,color,fade,actual,power', JSON.stringify(r));

// M3/M4: the recorded version decides, and each is its own answer
const v1 = await P.getProfile('padi.lighting', '1');
const v2 = await P.getProfile('padi.lighting', '2');
check('M3 padi.lighting:1 is Deprecated', v1.ok && v1.profile.status === 'deprecated' && v1.profile.version === 1, JSON.stringify(v1));
check('M4 v1 and v2 are separate answers with their own properties',
  v2.profile.status === 'published' && Object.keys(v1.profile.properties).length === 2 && Object.keys(v2.profile.properties).length === 5);

// M5: absence is not unavailability
r = await P.getProfile('padi.no.such');
check('M5 unregistered is "not registered"', !r.ok && r.kind === 'not registered', JSON.stringify(r));
r = await P.getProfile('padi.appliance');
check('   nothing published is "nothing published"', !r.ok && r.kind === 'nothing published', JSON.stringify(r));
r = await P.getProfile('padi.lighting', '3');
check('   a version that does not exist is "no such version"', !r.ok && r.kind === 'no such version', JSON.stringify(r));

// M6: an outage is not cached; the answer comes back without a restart
const Q = createProfiles({ fetch: fakeFetch, retryGap: 30, absentTtl: 0 });
offline = true;
r = await Q.getProfile('padi.light');
check('M6 while down: "registry unavailable"', !r.ok && r.kind === 'registry unavailable', JSON.stringify(r));
offline = false;
await new Promise((res) => setTimeout(res, 60));
r = await Q.getProfile('padi.light');
check('   once back: the properties, no restart', r.ok && r.profile.version === 1, JSON.stringify(r));

// the old faults are gone
check('never asks cp.padi.io: the resolver reads cp.cnscp.io', createProfiles().origin === 'https://cp.cnscp.io');
check('an empty name is not registered, not a crash', (await P.getProfile('')).kind === 'not registered');
check('a result crosses IPC as plain data', (() => { try { structuredClone(v2); return true; } catch (_) { return false; } })());

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
