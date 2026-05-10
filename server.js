const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY_1 || "";

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/chat", async (req, res) => {
    if (!GROQ_API_KEY) {
        return res.json({ reply: "Ключ не задан. Добавь GROQ_API_KEY_1 в переменные окружения Render." });
    }
    
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    
    const isTranslation = userRole.toLowerCase().includes("translate");
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    let systemPrompt;
    let model;
    
    if (isTranslation) {
        systemPrompt = userRole;
        model = "llama-3.3-70b-versatile";
    } else if (isCommand) {
        message = message.replace(/!/g, "").trim();
        systemPrompt = userRole;
        model = "llama-3.1-8b-instant";
    } else {
        systemPrompt = "You are Maria, a devoted maid. Reply in SAME language. Be short.";
        model = "llama-3.3-70b-versatile";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: message });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_API_KEY },
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
            return res.json({ reply: "Ключ исчерпал лимит. Жди." });
        }
        
        if (response.status === 401) {
            return res.json({ reply: "Ключ недействителен (401). Проверь ключ." });
        }

        return res.json({ reply: "Ошибка Groq (" + response.status + ")." });

    } catch (e) {
        return res.json({ reply: "Прокси не может соединиться с Groq." });
    }
});

app.listen(3000);
