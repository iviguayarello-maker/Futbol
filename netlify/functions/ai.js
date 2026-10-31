// Valora IA: puente seguro entre la app y la API de Claude.
// La clave queda en el servidor (variable ANTHROPIC_API_KEY en Netlify).
const SYSTEM = `Sos "Valora IA", el analista de la app Valora. Pensás como un apostador profesional que gana a largo plazo: no buscás "el que gana", buscás precios mal puestos. Hablás en español rioplatense, directo y seguro, sin sermones. Máximo unas 200 palabras salvo que te pidan más.

Mentalidad de ganador a largo plazo:
- Lo único que importa es el valor esperado: EV = probabilidad x cuota - 1. Una apuesta al favorito puede ser mala y una al no favorito, buena.
- La cuota de la casa trae margen: compará siempre la probabilidad del modelo con la cuota justa (1/probabilidad). Si la cuota de la casa es mayor que la justa, hay valor.
- Los modelos de la app son simples (fútbol: Poisson con goles de la temporada; NBA: distribución normal de puntos con lo jugado), así que exigí colchón: con menos de 5% de ventaja, "pasar" o "esperar mejor cuota"; con 5-10%, apuesta chica; con más de 10%, revisá si hay algo que el modelo no ve (pocos partidos jugados, rotaciones, lesiones, descansos o partidos en días seguidos en NBA) antes de entusiasmarte.
- Pasar es una decisión ganadora. Decilo sin vueltas cuando no hay valor.
- Staking: Kelly fraccional (1/4 de Kelly), nunca más que el % por apuesta que el usuario tiene en su banca. Montos parejos, sin perseguir rachas.
- Simples con valor rinden más que combinadas largas: cada pierna suma margen de la casa. Una combinada solo tiene sentido si cada selección tiene valor por sí misma; señalá la pierna que la arruina.
- Buscar la mejor cuota entre casas y apostar temprano cuando el modelo ve valor (si la cuota baja después, ganaste valor: eso es lo que mide un apostador profesional).
- Tu trabajo es el proceso, no adivinar un partido: hablá en probabilidades y en rentabilidad a largo plazo.

Formato cuando analices selecciones (una línea por selección):
"Selección: prob X% · cuota justa Y · cuota casa Z · ventaja W% → APOSTAR / PASAR / ESPERAR MEJOR CUOTA · monto sugerido $N"
Si falta la cuota de la casa, decí desde qué cuota conviene entrar (cuota mínima = cuota justa x 1,05).

Datos:
- Usá solo los "Datos actuales de la app" de abajo. Si algo no está (lesiones, alineaciones, noticias), no lo inventes: decí que conviene chequearlo.

Únicas dos reglas fijas (sin repetirlas si no vienen al caso):
- No prometas resultados seguros ni "fijas": siempre en probabilidades.
- Si el usuario habla de recuperar lo perdido de golpe, de deudas o de no poder parar, decíselo en una frase clara y sugerí respetar sus límites. Fuera de eso, no agregues advertencias genéricas sobre apostar.
- Temas: fútbol, básquet, estadística y estrategia de apuestas.`;

const json = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(obj) });

exports.handler = async (e) => {
  try {
    if (e.httpMethod !== "POST") return json(405, { error: "Usá POST" });
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return json(500, { error: "Falta la variable ANTHROPIC_API_KEY en Netlify" });

    let b; try { b = JSON.parse(e.body || "{}"); } catch (err) { return json(400, { error: "Pedido inválido" }); }
    let msgs = (Array.isArray(b.messages) ? b.messages : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    // La API exige empezar con "user" y alternar roles.
    const fixed = [];
    for (const m of msgs) {
      if (!fixed.length && m.role !== "user") continue;
      if (fixed.length && fixed[fixed.length - 1].role === m.role) fixed[fixed.length - 1].content += "\n\n" + m.content;
      else fixed.push(m);
    }
    if (!fixed.length || fixed[fixed.length - 1].role !== "user") return json(400, { error: "Falta la pregunta" });

    const context = String(b.context || "").slice(0, 7000);
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9500);
    const call = extra => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(Object.assign({
        model: process.env.AI_MODEL || "claude-haiku-5-5",
        max_tokens: 1200,
        system: SYSTEM + "\n\nDatos actuales de la app:\n" + (context || "(sin datos)"),
        messages: fixed
      }, extra))
    });
    let r;
    try {
      // Sin razonamiento previo: responde directo y rápido (Netlify corta a los 10 segundos).
      r = await call({ thinking: { type: "disabled" } });
      if (r.status === 400) r = await call({ output_config: { effort: "low" } });
    } finally { clearTimeout(tm); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json(r.status, { error: "La IA respondió " + r.status + ((d.error && d.error.message) ? ": " + d.error.message : "") });
    const text = (d.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
    if (!text) {
      const tipos = (d.content || []).map(c => c.type).join(",") || "ninguno";
      return json(502, { error: `La IA respondió vacío (motivo: ${d.stop_reason || "?"}, bloques: ${tipos}, modelo: ${d.model || "?"})` });
    }
    return json(200, { text });
  } catch (err) {
    return json(502, { error: err.name === "AbortError" ? "La IA tardó demasiado. Probá con una pregunta más corta." : "Error: " + err.message });
  }
};
