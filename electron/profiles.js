// profiles.js — the Monitor's Profile lookup, in the main process.
// Copyright 2026 Padi, Inc. All Rights Reserved.
//
// The renderer asks for a Profile by name and, when it has one, the version
// the realm recorded on the capability. The answer is one of
//
//   { ok: true,  profile }   the contract in the resolver's tool shape
//                            (title, roles, properties[name].role/.description,
//                            version, status: 'published' | 'deprecated')
//   { ok: false, kind }      why not: 'not registered' | 'nothing published' |
//                            'no such version' | 'deprecated' | 'registry unavailable'
//
// With no recorded version, the version cns-cli would pick at Declare is used
// (the highest published, non-Deprecated one). Nothing is ever taken from the
// last entry of a list, and nothing is merged across versions.
//
// "registry unavailable" is never remembered here: the resolver does not hold
// it, and the renderer asks again. The resolver reads cp.cnscp.io, fixed.

import './cp-resolver.js';

const R = globalThis.CPResolver;

export function createProfiles(opts) {
  const resolver = R.createResolver(opts || {});

  async function getProfile(name, version) {
    if (!name) return { ok: false, kind: R.UNREGISTERED, name: name };

    try {
      let v = version;

      if (v === undefined || v === null || String(v) === '') {
        const cur = await resolver.current(name);
        if (cur.version === null) return { ok: false, kind: cur.reason, name: name };
        v = cur.version;
      }

      return { ok: true, profile: await resolver.contract(name, v) };
    } catch (e) {
      return { ok: false, kind: (e && e.kind) || R.UNAVAILABLE, name: name, version: version, message: e && e.message };
    }
  }

  return { getProfile: getProfile, origin: resolver.origin, counts: resolver.counts, resolver: resolver };
}
