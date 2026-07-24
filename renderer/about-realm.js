// about-realm.js — the "About the realm" card on the Status tab.
// ---------------------------------------------------------------------------
// PROTOTYPE of the realm-describes-itself idea: the realm (or, until the
// orchestrator does it for real, the Widget app's Realm Simulator) publishes
// facts about itself as a PROVIDER of cp:local.realm.info, and this card is
// simply a consumer-side rendering of whatever it finds on the wire —
// version, uptime, how busy the realm is, and the capacity of the realm
// database. Honest by construction: everything shown is labeled with WHO
// published it; nothing here is invented by Monitor.
// The real contract (padi.realm.info) gets designed once this UX settles.
// ---------------------------------------------------------------------------
(function () {
  const root = document.getElementById('aboutRealm');
  if (!root || !window.AreteModel) return;
  const { esc, parseKeys, onChange, getKeys } = window.AreteModel;
  // Accept the registered test CP first, the offline local prototype second.
  const PROFILES = ['padi.test.realm.info', 'local.realm.info'];

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const fmt = (v) => (v == null || v === '' ? '—' : String(v));

  function render(keys) {
    const model = parseKeys(keys);
    const pubs = Object.values(model.caps).filter((c) => c.role === 'provider' && PROFILES.includes(c.profile));
    if (!pubs.length) {
      root.innerHTML = `<p class="muted-note">Nothing on this realm publishes <span class="mono">cp:${PROFILES[0]}</span> yet.</p>`;
      return;
    }
    const cap = pubs[0];
    const who = model.label(cap.ctxPath);
    const p = cap.props;

    const load = num(p.load);
    const loadPct = load != null ? Math.max(0, Math.min(100, load * 10)) : null;
    const loadWord = load == null ? '—' : load <= 1 ? 'idle' : load <= 4 ? 'quiet' : load <= 7 ? 'busy' : 'saturated';

    root.innerHTML = `
      <div class="realm-stats">
        <div class="rstat"><div class="rstat-n">${esc(fmt(p.version))}</div><div class="rstat-l">CNS version</div></div>
        <div class="rstat"><div class="rstat-n">${esc(fmt(p.uptime))}${p.uptime ? ' h' : ''}</div><div class="rstat-l">Uptime</div></div>
        <div class="rstat"><div class="rstat-n">${esc(fmt(p.keys))}</div><div class="rstat-l">Keys held</div></div>
        <div class="rstat"><div class="rstat-n">${esc(fmt(p.rate))}</div><div class="rstat-l">msg/min</div></div>
      </div>
      <div class="abar-row"><span class="abar-l">Busyness</span>
        <div class="abar"><div class="abar-fill load${load != null && load > 7 ? ' warn' : ''}" style="width:${loadPct ?? 0}%"></div></div>
        <span class="abar-v">${load ?? '—'} / 10 · ${loadWord}</span>
      </div>
      <div class="realm-stats rstat-counters">
        <div class="rstat"><div class="rstat-n">${esc(fmt(p.reads))}</div><div class="rstat-l">Reads</div></div>
        <div class="rstat"><div class="rstat-n">${esc(fmt(p.writes))}</div><div class="rstat-l">Writes</div></div>
        <div class="rstat"><div class="rstat-n">${esc(fmt(p.updates))}</div><div class="rstat-l">Updates</div></div>
        <div class="rstat"><div class="rstat-n${num(p.errors) ? ' rstat-warn' : ''}">${esc(fmt(p.errors))}</div><div class="rstat-l">Errors</div></div>
      </div>
      <p class="muted-note about-src">as published by ${esc(who.system)} · ${esc(who.node)}${pubs.length > 1 ? ` (+${pubs.length - 1} more publisher${pubs.length > 2 ? 's' : ''})` : ''} · prototype <span class="mono">cp:${esc(cap.profile)}</span></p>`;
  }

  onChange(render);
  render(getKeys());
})();
