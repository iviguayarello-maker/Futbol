// Proxy a OddsPapi: la clave queda en el servidor (variable ODDSPAPI_KEY)
exports.handler = async (e) => {
  const q = e.queryStringParameters || {};
  const p = q.p || "";
  if (!/^(fixtures|tournaments|markets|odds[a-z-]*)(\?[A-Za-z0-9=&,_.:-]*)?$/.test(p))
    return { statusCode: 400, body: "bad request" };
  const url = "https://api.oddspapi.io/v4/" + p + (p.includes("?") ? "&" : "?") + "apiKey=" + encodeURIComponent(process.env.ODDSPAPI_KEY || "");
  const r = await fetch(url);
  let body = await r.text();
  if (q.n) { try { const j = JSON.parse(body); if (Array.isArray(j)) body = JSON.stringify(j.slice(0, +q.n)); } catch (err) {} }
  return { statusCode: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" }, body };
};
