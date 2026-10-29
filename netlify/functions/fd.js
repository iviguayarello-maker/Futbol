// Proxy a football-data.org: la clave queda en el servidor (variable FD_TOKEN)
exports.handler = async (e) => {
  const p = (e.queryStringParameters || {}).p || "";
  if (!/^competitions\/(PL|CL|PD|BSA)\/matches(\?[A-Za-z0-9=&,_-]*)?$/.test(p))
    return { statusCode: 400, body: "bad request" };
  const r = await fetch("https://api.football-data.org/v4/" + p, {
    headers: { "X-Auth-Token": process.env.FD_TOKEN },
  });
  return {
    statusCode: r.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
    body: await r.text(),
  };
};
