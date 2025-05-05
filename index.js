/*───────────────────────────────────────────
   JP-Bot – Webhook Google Chat ➊➋➌
───────────────────────────────────────────*/
import express from "express";
import { OpenAI } from "openai";
import dotenv from "dotenv";
dotenv.config();

/* Clé OpenAI et ID de l’assistant (variables d’env.) */
const openai      = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.ASSISTANT_ID;

/* Express */
const app = express();
app.use(express.json());

/* Map qui relie un espace Google Chat à un thread OpenAI */
const threads = new Map();

/*───────────────  Webhook  ───────────────*/
app.post("/webhook", async (req, res) => {
  try {
    const chatThreadId = req.body.space?.name || "default";
    const userMessage  = (req.body.message?.text || "").trim();

    /* 1. on ignore les événements sans texte (ex. ajout au space) */
    if (!userMessage) {
      return res.json({ text: "👍" });
    }

    /* 2. récupère ou crée le thread OpenAI correspondant */
    let threadId = threads.get(chatThreadId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threads.set(chatThreadId, threadId);
    }

    /* 3. ajoute le message utilisateur au thread */
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });

    /* 4. lance le run */
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    /* 5. attend que le run se termine */
    let status = run.status;
    while (status !== "completed" && status !== "failed") {
      await new Promise(r => setTimeout(r, 1500));
      const updated = await openai.beta.threads.runs.retrieve(threadId, run.id);
      status = updated.status;
    }
    if (status === "failed") {
      throw new Error("Le run OpenAI a échoué");
    }

    /* 6. récupère la dernière réponse */
    const msgs  = await openai.beta.threads.messages.list(threadId, { limit: 1 });
    let  reply  = msgs.data[0].content[0].text.value;

    /* 7. Convertit Markdown classique → format Google Chat
          **gras**  ⇒ *gras*      __italique__ ⇒ _italique_
    */
    reply = reply
      .replace(/\*\*(.*?)\*\*/g, '*$1*')
      .replace(/__(.*?)__/g, '_$1_');

    /* 8. renvoie vers Google Chat */
    return res.json({ text: reply });

  } catch (err) {
    console.error(err);
    return res.json({ text: "Désolé : erreur serveur 😕" });
  }
});

/* Port : Render fournit PORT automatiquement, sinon 10000 */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`JP-Bot en ligne sur le port ${PORT}`));

