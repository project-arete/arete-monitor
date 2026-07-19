// scripts/dump-keys.js — read-only snapshot of a realm's CNS key namespace.
// Connects, waits for the cache to fill from update events, prints a sample,
// and writes the full keys object to /tmp/realm-keys.json.
//
// Usage: ARETE_HOST=my.realm.example.com ARETE_ALLOW_SELF_SIGNED=1 node scripts/dump-keys.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import { installSystemIdPatch } from '../electron/arete-system-id.js';

installSystemIdPatch('dump-' + crypto.randomUUID());

const host = process.env.ARETE_HOST || 'dashboard.test.cns.dev';
const port = Number(process.env.ARETE_PORT || 443);
const user = process.env.ARETE_USER || '';
const pass = process.env.ARETE_PASS || '';
if ((process.env.ARETE_ALLOW_SELF_SIGNED || '1') === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let hostForSdk = host;
if (user || pass) hostForSdk = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}`;

const { Client } = await import('arete-sdk');
const client = new Client({ protocol: 'wss:', host: hostForSdk, port });

let updates = 0;
client.on('update', () => updates++);

try {
  await client.waitForOpen(10000);
  console.log('connected; waiting for cache to fill...');
  await new Promise((r) => setTimeout(r, 5000));

  const keys = client.keys || {};
  const names = Object.keys(keys);
  console.log('UPDATES RECEIVED:', updates);
  console.log('VERSION:', client.version);
  console.log('STATS:', JSON.stringify(client.stats));
  console.log('KEY COUNT:', names.length);
  console.log('--- first 100 keys ---');
  names.slice(0, 100).forEach((k) => console.log(k, '=', JSON.stringify(keys[k])));
  fs.writeFileSync('/tmp/realm-keys.json', JSON.stringify(keys, null, 2));
  console.log('\nFull dump written to /tmp/realm-keys.json');
} catch (e) {
  console.error('FAILED:', e && e.message ? e.message : e);
} finally {
  client.close();
  setTimeout(() => process.exit(0), 300);
}
