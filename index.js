const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const CONFIG = {
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "mi_token_secreto",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

const SYSTEM_PROMPT = `Eres un asistente virtual de ventas amable, profesional y persuasivo para una academia de educación a distancia llamada "Diplomados a Distancia Online".

Tu objetivo es:
1. Dar la bienvenida al prospecto calurosamente
2. Identificar qué curso o diplomado le interesa
3. Explicar los beneficios: modalidad 100% en línea, certificación oficial, precios accesibles, soporte continuo
4. Resolver dudas sobre duración, costo, temario y modalidad
5. Guiar al prospecto hacia el cierre: agendar una llamada, enviar link de pago, o transferir con un asesor

Catálogo de cursos:
- Diplomado en Marketing Digital — 3 meses — $299 USD
- Curso de Diseño Gráfico — 6 semanas — $149 USD
- Diplomado en Administración de Empresas — 4 meses — $349 USD
- Curso de Programación Web — 8 semanas — $199 USD
- Diplomado en Recursos Humanos — 3 meses — $279 USD

Reglas importantes:
- Responde siempre en español
- Sé conciso (máximo 3-4 oraciones por mensaje)
- Usa emojis con moderación 😊
- Si no sabes algo, di que un asesor se comunicará pronto
- Si el usuario quiere hablar con humano responde: "Perfecto, te conecto con un asesor ahora mismo. ¡En breve te contactan! 👋"
`;

const conversaciones = {};

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return res.sendStatus(404);
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages || messages.length === 0) return res.sendStatus(200);
    const message = messages[0];
    if (message.type !== "text") return res.sendStatus(200);
    const from = message.from;
    const text = message.text.body;
    console.log(`📩 Mensaje de ${from}: ${text}`);
    if (!conversaciones[from]) conversaciones[from] = [];
    conversaciones[from].push({ role: "user", content: text });
    const respuesta = await llamarClaude(conversaciones[from]);
    conversaciones[from].push({ role: "assistant", content: respuesta });
    if (conversaciones[from].length > 20) {
      conversaciones[from] = conversaciones[from].slice(-20);
    }
    await enviarMensaje(from, respuesta);
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.sendStatus(500);
  }
});

async function llamarClaude(historial) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: historial,
    },
    {
      headers: {
        "x-api-key": CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.content[0].text;
}

async function enviarMensaje(to, texto) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: texto },
    },
    {
      headers: {
        Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
  console.log(`✅ Respuesta enviada a ${to}`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot corriendo en puerto ${PORT}`);
});
