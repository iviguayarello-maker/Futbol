// Proxy a OddsPapi. La clave queda en el servidor (variable ODDSPAPI_KEY).
// Achica las respuestas para no superar el límite de tamaño de Netlify.
const pick = (o, ks) => { for (const k of ks) { const v = k.split(".").reduce((a, x) => (a == null ? a : a[x]), o); if (v != null && v !== "") return v; } return null; };
const json = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": code === 200 ? "public, max-age=600" : "no-store" }, body: JSON.stringify(obj) });

exports.handler = async (e) => {
  try {
    const q = e.queryStringParameters || {};
    const p = q.p || "";
    if (!/^(fixtures|markets|odds|historical-odds)(\?[A-Za-z0-9=&,_.:-]*)?$/.test(p)) return json(400, { error: "pedido no válido" });
    if (!process.env.ODDSPAPI_KEY) return json(500, { error: "Falta la variable ODDSPAPI_KEY en Netlify" });

    const pp = p;
    const url = "https://api.oddspapi.io/v4/" + pp + (pp.includes("?") ? "&" : "?") + "apiKey=" + encodeURIComponent(process.env.ODDSPAPI_KEY);
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9000);
    let r;
    try { r = await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(tm); }
    const txt = await r.text();
    if (!r.ok) return json(r.status, { error: "OddsPapi respondió " + r.status, detalle: txt.slice(0, 300) });

    let d; try { d = JSON.parse(txt); } catch (err) { return json(502, { error: "Respuesta no es JSON", detalle: txt.slice(0, 200) }); }

    if (p.startsWith("fixtures")) {
      const L = Array.isArray(d) ? d : (d.fixtures || d.data || []);
      const out = L.map(f => ({
        fixtureId: pick(f, ["fixtureId", "id"]),
        startTime: pick(f, ["startTime", "trueStartTime", "startAt", "date"]),
        participant1Name: pick(f, ["participant1Name", "homeTeamName", "homeTeam.name", "home.name", "participants.0.name", "team1Name"]),
        participant2Name: pick(f, ["participant2Name", "awayTeamName", "awayTeam.name", "away.name", "participants.1.name", "team2Name"]),
        tournamentName: pick(f, ["tournamentName", "tournament.name", "categoryName"])
      }));
      if (q.debug) return json(200, { total: L.length, camposDelPrimero: L[0] ? Object.keys(L[0]) : [], ejemplo: out.slice(0, 3) });
      return json(200, out);
    }
    if (p.startsWith("historical-odds")) {
      // Cuota de cierre: el último precio publicado antes del inicio del partido.
      const want = new Set(String(q.mk || "101,104,1010").split(",").filter(Boolean));
      const T = q.t ? Date.parse(q.t) : Infinity;
      const bo = d.bookmakers || d.bookmakerOdds || {}, out = {};
      for (const [bk, v] of Object.entries(bo)) {
        const ms = {};
        for (const [mid, m] of Object.entries((v && v.markets) || {})) {
          if (!want.has(mid)) continue;
          const oc = {};
          for (const [oid, o] of Object.entries((m && m.outcomes) || {})) {
            let sn = o && o.players && o.players["0"];
            if (!Array.isArray(sn)) sn = sn ? [sn] : [];
            let best = null;
            for (const x of sn) { const ts = Date.parse(x.createdAt || x.timestamp || 0); if (x && x.price > 1 && x.active !== false && (!(ts > 0) || ts <= T)) { if (!best || ts >= best.ts) best = { ts, price: x.price }; } }
            if (best) oc[oid] = best.price;
          }
          if (Object.keys(oc).length) ms[mid] = oc;
        }
        if (Object.keys(ms).length) out[bk] = ms;
      }
      return json(200, { fixtureId: d.fixtureId, odds: out, hist: true });
    }
    if (p.startsWith("odds")) {
      const want = new Set(String(q.mk || "101,104,1010").split(",").filter(Boolean));
      const bo = d.bookmakerOdds || {}, out = {};
      for (const [bk, v] of Object.entries(bo)) {
        if (!v || v.bookmakerIsActive === false || v.suspended) continue;
        const ms = {};
        for (const [mid, m] of Object.entries(v.markets || {})) {
          if (!want.has(mid)) continue;
          const oc = {};
          for (const [oid, o] of Object.entries((m && m.outcomes) || {})) {
            const pl = o && o.players && o.players["0"];
            if (pl && pl.active !== false && pl.price > 1) oc[oid] = pl.price;
          }
          if (Object.keys(oc).length) ms[mid] = oc;
        }
        if (Object.keys(ms).length) out[bk] = ms;
      }
      const first = Object.values(bo)[0];
      return json(200, { fixtureId: d.fixtureId, odds: out, totalCasas: Object.keys(bo).length, casas: Object.keys(bo).slice(0, 8), mercados: first && first.markets ? Object.keys(first.markets).slice(0, 12) : [], pedidos: [...want].slice(0, 12) });
    }
    if (p.startsWith("markets")) {
      const L = Array.isArray(d) ? d : [];
      const sp = +((p.match(/sportId=(\d+)/) || [])[1] || 10);
      return json(200, L.filter(m => !m.sportId || m.sportId === sp).map(m => ({ marketId: m.marketId, marketName: m.marketName, handicap: m.handicap, period: m.period, sportId: m.sportId, outcomes: (m.outcomes || []).map(o => ({ outcomeId: o.outcomeId, outcomeName: o.outcomeName })) })));
    }
    return json(200, d);
  } catch (err) {
    return json(502, { error: err.name === "AbortError" ? "OddsPapi tardó demasiado en responder" : "Error en la función: " + err.message });
  }
};
