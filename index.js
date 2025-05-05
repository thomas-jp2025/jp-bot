import express from "express";
import { OpenAI } from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.ASSISTANT_ID;

const app = express();
app.use(express.json());

// Map → associe l’ID du chat Google à l’ID du thread OpenAI
const threads = new Map();

app.post("/webhook", async (req, res) => {
  try {
    const chatThreadId = req.body.space?.name || "default";
    const userMessage = (req.body.message?.text || "").trim();

    // Ignore les événements sans texte (ex. ajout au space)
    if (!userMessage) {
      return res.json({ text: "👍" });
    }

    // Récupère ou crée un thread OpenAI
    let threadId = threads.get(chatThreadId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threads.set(chatThreadId, threadId);
    }

    // Ajoute le message utilisateur
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });

    // Lance l’assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    // Attend que le run se termine
    let status = run.status;
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1500));
      const updated = await openai.beta.threads.runs.retrieve(threadId, run.id);
      status = updated.status;
    }
    if (status === "failed") {
      throw new Error("Le run a échoué");
    }

    // Récupère la dernière réponse
    const msgs = await openai.beta.threads.messages.list(threadId, { limit: 1 });
    const reply = msgs.data[0].content[0].text.value;

    // Répond à Google Chat


// Conversion Markdown → format Google Chat
reply = reply
  .replace(/\*\*(.*?)\*\*/g, '*$1*')   // **gras** → *gras*
  .replace(/__(.*?)__/g, '_$1_');      // __italique__ → _italique_

    
    res.json({ text: reply });

  } catch (err) {
    console.error(err);
    res.json({ text: "Désolé, une erreur est survenue 😕" });
  }
});

// Render fournit PORT dans la variable d’env. sinon 10000
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`JP-bot en ligne sur le port ${PORT}`));
