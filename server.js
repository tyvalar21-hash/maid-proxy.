const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
    process.env.GROQ_API_KEY_6
].filter(Boolean);

let currentKeyIndex = 0;

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/chat", async (req, res) => {
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    const keyNumber = currentKeyIndex + 1;
    
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    const playerName = req.body.playerName || "";
    
    const isTranslation = userRole.toLowerCase().includes("translate");
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    let systemPrompt;
    let model;
    let finalMessage = message;
    
    if (isTranslation) {
        finalMessage = message;
        systemPrompt = userRole;
        model = "llama-3.3-70b-versatile";
    } else if (isCommand) {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = userRole;
        model = "llama-3.1-8b-instant";
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master'. Reply in SAME language. Be short.";
        model = "llama-3.3-70b-versatile";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: finalMessage });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({ model: model, messages: messages, stream: false })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                return res.json({ reply: data.choices[0].message.content });
            }
            return res.json({ reply: "Ошибка Groq: пустой ответ" });
        }

        if (response.status === 429) {
            return res.json({ reply: "Ключ " + keyNumber + " исчерпал лимит." });
        }

        return res.json({ reply: "Ошибка Groq (" + response.status + ")." });

    } catch (e) {
        return res.json({ reply: "Прокси не может соединиться с Groq." });
    }
});

app.listen(3000);
