// Proxy a OddsPapi. La clave queda en el servidor (variable ODDSPAPI_KEY).
// Achica las respuestas para no superar el límite de tamaño de Netlify.
const pick = (o, ks) => { for (const k of ks) { const v = k.split(".").reduce((a, x) => (a == null ? a : a[x]), o); if (v != null && v !== "") return v; } return null; };
const json = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": code === 200 ? "public, max-age=600" : "no-store" }, body: JSON.stringify(obj) });

exports.handler = async (e) => {
  try {
    const q = e.queryStringParameters || {};
    const p = q.p || "";
    if (!/^(fixtures|markets|odds)(\?[A-Za-z0-9=&,_.:-]*)?$/.test(p)) return json(400, { error: "pedido no válido" });
    if (!process.env.ODDSPAPI_KEY) return json(500, { error: "Falta la variable ODDSPAPI_KEY en Netlify" });

    const url = "https://api.oddspapi.io/v4/" + p + (p.includes("?") ? "&" : "?") + "apiKey=" + encodeURIComponent(process.env.ODDSPAPI_KEY);
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
    if (p.startsWith("odds")) {
      const bk = (p.match(/bookmakers=([a-z0-9.,_-]+)/) || [])[1] || "betano";
      const bo = d.bookmakerOdds || {};
      const keep = {}; bk.split(",").forEach(k => { if (bo[k]) keep[k] = bo[k]; });
      if (q.debug) return json(200, { casas: Object.keys(bo), mercadosBetano: keep.betano ? Object.keys(keep.betano.markets || {}).slice(0, 40) : [] });
      return json(200, { fixtureId: d.fixtureId, bookmakerOdds: keep });
    }
    if (p.startsWith("markets")) {
      const L = Array.isArray(d) ? d : [];
      return json(200, L.filter(m => !m.sportId || m.sportId === 10).map(m => ({ marketId: m.marketId, marketName: m.marketName, handicap: m.handicap, period: m.period, sportId: m.sportId, outcomes: (m.outcomes || []).map(o => ({ outcomeId: o.outcomeId, outcomeName: o.outcomeName })) })));
    }
    return json(200, d);
  } catch (err) {
    return json(502, { error: err.name === "AbortError" ? "OddsPapi tardó demasiado en responder" : "Error en la función: " + err.message });
  }
};
