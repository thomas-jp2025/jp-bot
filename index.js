import express from "express";
import { OpenAI } from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.ASSISTANT_ID;

const app = express();
app.use(express.json());

// Associe un fil Google Chat ↔ fil OpenAI
const threads = new Map();

app.post("/webhook", async (req, res) => {
  try {
    const chatThreadId = req.body.space?.name || "default";
    const userMessage = req.body.message?.text || "";

    // récupère ou crée le thread OpenAI
    let threadId = threads.get(chatThreadId);
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threads.set(chatThreadId, threadId);
    }

    // ajoute le message utilisateur
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage
    });

    // lance l’assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });

    // attend la fin du run
    let status = run;
    while (!["completed", "requires_action", "failed"].includes(status.status)) {
      await new Promise(r => setTimeout(r, 1000));
      status = await openai.beta.threads.runs.retrieve(threadId, status.id);
    }

    let answer = "Je ne sais pas.";
    if (status.status === "completed") {
      const msgs = await openai.beta.threads.messages.list(threadId, { limit: 1 });
      answer = msgs.data[0].content[0].text.value;
    }

    res.json({ text: answer });
  } catch (e) {
    console.error(e);
    res.json({ text: "Erreur serveur." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("JP-bot en ligne sur le port", PORT));
