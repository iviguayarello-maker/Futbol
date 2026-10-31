// NBA para Valora: trae partidos de balldontlie (resultados recientes y próximos).
// La clave queda en el servidor (variable BDL_KEY en Netlify). Plan gratis: 5 consultas por minuto.
const json = (code, obj, cache) => ({ statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": cache ? "public, max-age=900" : "no-store" }, body: JSON.stringify(obj) });
const ymd = d => d.toISOString().slice(0, 10);

exports.handler = async () => {
  try {
    const key = process.env.BDL_KEY;
    if (!key) return json(500, { error: "Falta la variable BDL_KEY en Netlify" });
    const now = Date.now(), start = ymd(new Date(now - 40 * 864e5)), end = ymd(new Date(now + 6 * 864e5));
    const all = []; let cursor = null;
    for (let page = 0; page < 4; page++) {
      const url = `https://api.balldontlie.io/v1/games?start_date=${start}&end_date=${end}&per_page=100` + (cursor ? `&cursor=${cursor}` : "");
      const r = await fetch(url, { headers: { Authorization: key } });
      const txt = await r.text();
      if (!r.ok) return json(r.status, { error: "balldontlie respondió " + r.status, detalle: txt.slice(0, 200) });
      const d = JSON.parse(txt);
      all.push(...(d.data || []));
      cursor = d.meta && d.meta.next_cursor;
      if (!cursor) break;
    }
    const team = t => ({ name: t.full_name || t.name, shortName: t.name || t.full_name, tla: t.abbreviation || "" });
    const matches = all.filter(g => g && g.home_team && g.visitor_team && !g.postponed).map(g => {
      const fin = g.status_state ? g.status_state === "final" : /final/i.test(String(g.status || ""));
      return {
        id: "nba" + g.id,
        utcDate: g.datetime || g.date,
        status: fin ? "FINISHED" : "SCHEDULED",
        homeTeam: team(g.home_team),
        awayTeam: team(g.visitor_team),
        score: { fullTime: { home: fin ? g.home_team_score : null, away: fin ? g.visitor_team_score : null } }
      };
    });
    return json(200, { matches }, true);
  } catch (err) {
    return json(502, { error: "Error en la función NBA: " + err.message });
  }
};
