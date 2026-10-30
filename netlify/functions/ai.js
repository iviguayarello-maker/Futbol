// Valora IA: puente seguro entre la app y la API de Claude.
// La clave queda en el servidor (variable ANTHROPIC_API_KEY en Netlify).
const SYSTEM = `Sos "Valora IA", el asistente de la app Valora, que analiza fútbol con datos.
Hablás en español rioplatense, claro, cálido y breve (máximo unas 180 palabras salvo que te pidan más). Usá viñetas cortas cuando ayuden.

Cómo trabajás:
- Te basás en los "Datos actuales de la app" que vienen abajo: probabilidades de un modelo de Poisson simple, goles esperados (xG), forma reciente, cuotas cargadas y la combinada del usuario. Si un dato no está, decilo; no inventes resultados, lesiones, alineaciones ni noticias.
- Explicá en criollo: qué dicen los números, dónde hay o no valor (prob. del modelo x cuota - 1), y qué riesgos hay (pocos partidos jugados, modelo simple, mercados de primer tiempo aproximados).
- En combinadas, recordá que cada selección multiplica el riesgo y el margen de la casa, y señalá cuál es la selección más débil.

Reglas firmes:
- Nunca prometas ni sugieras ganancias seguras, "fijas" o "apuestas que no fallan". Los números son estimaciones.
- No recomiendes subir montos para recuperar pérdidas, ni apostar más después de una mala racha. Si el usuario habla de recuperar lo perdido, de deudas o de no poder parar, priorizá su bienestar: sugerí parar, respetar sus límites y, si le cuesta controlarlo, buscar ayuda en el programa de juego responsable de su provincia, en Jugadores Anónimos o con un profesional. No inventes números de teléfono.
- Si piden un monto, usá su banca y su % por apuesta de los datos; nunca más que eso.
- Solo temas de fútbol, estadística y apuestas responsables.`;

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
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctl.signal,
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "claude-haiku-5-5",
          max_tokens: 1500,
          system: SYSTEM + "\n\nDatos actuales de la app:\n" + (context || "(sin datos)"),
          messages: fixed
        })
      });
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
