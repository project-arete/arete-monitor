// realm-stats.js — "What the realm reports (raw)" diagnostic on the Status tab.
// ---------------------------------------------------------------------------
// DISCOVERY step for cp:padi.test.realm.info: before deciding what the realm
// can HONESTLY publish about itself, we look at what it already hands this
// client. Three real sources, all labeled as client-observed:
//   • client.version  — the CNS version (control-plane reported)
//   • client.stats    — merged straight from control-plane messages, so this
//                       is whatever the REALM itself reports (unknown until we
//                       look — may already carry counts/uptime/throughput)
//   • client.keys     — the full namespace; its size is a real "keys stored",
//                       and updates/min is a real activity measure this client
//                       can time locally.
// Nothing here is invented — it's a raw readout to design the real
// padi.realm.info contract (and what the orchestrator should eventually
// publish) around what actually exists.
// ---------------------------------------------------------------------------
(function () {
  const root = document.getElementById('realmStatsRaw');
  if (!root || !window.AreteModel) return;
  const { esc, getKeys, onChange } = window.AreteModel;

  let stats = {};
  let version = '';
  const stamps = []; // update timestamps → observed updates/min

  const fmtVal = (v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v));

  function render() {
    const keyCount = Object.keys(getKeys() || {}).length;
    const now = Date.now();
    while (stamps.length && now - stamps[0] > 60000) stamps.shift();
    const rate = stamps.length;

    const statKeys = Object.keys(stats || {});
    const statRows = statKeys.length
      ? statKeys.sort().map((k) =>
          `<div class="rr-row"><span class="rr-k">${esc(k)}</span><span class="rr-v mono">${esc(fmtVal(stats[k]))}</span></div>`).join('')
      : '<p class="muted-note">client.stats is empty — the realm reports nothing in this channel.</p>';

    root.innerHTML = `
      <div class="rr-grid">
        <div class="rr-row"><span class="rr-k">CNS version</span><span class="rr-v mono">${esc(version || '—')}</span></div>
        <div class="rr-row"><span class="rr-k">Keys in namespace</span><span class="rr-v mono">${keyCount}</span></div>
        <div class="rr-row"><span class="rr-k">Updates / min (observed)</span><span class="rr-v mono">${rate}</span></div>
      </div>
      <div class="rr-sep">client.stats — raw, exactly as the realm reports it</div>
      <div class="rr-grid">${statRows}</div>`;
  }

  if (window.arete && window.arete.onStatus) {
    window.arete.onStatus((st) => {
      if (!st) return;
      if (st.version) version = st.version;
      if (st.stats) stats = st.stats;
      render();
    });
  }
  onChange(() => { stamps.push(Date.now()); render(); });
  if (window.arete && window.arete.getStatus) {
    window.arete.getStatus().then((st) => {
      if (st) { version = st.version || ''; stats = st.stats || {}; }
      render();
    }).catch(() => {});
  }
  render();
})();
