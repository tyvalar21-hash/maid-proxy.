const express = require("express");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5, process.env.GROQ_API_KEY_6
].filter(Boolean);

let currentKeyIndex = 0;

app.post("/chat", async (req, res) => {
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    
    let message = req.body.message || "Hello";
    const history = req.body.history || [];
    const userRole = req.body.role || "";
    const isCommand = message.match(/!\s*!/);
    
    let systemPrompt;
    let model;
    
    if (isCommand) {
        message = message.replace(/!/g, "").trim();
        systemPrompt = "Convert to [command] [target] [params].";
        model = "llama-3.1-8b-instant";
    } else {
        systemPrompt = "You are Maria, a devoted maid. Reply in SAME language. Be short.";
        model = "llama-3.3-70b-versatile";
    }
    
    let messages = [{ role: "system", content: systemPrompt }];
    
    // Добавляем историю из запроса
    for (const msg of history) {
        messages.push(msg);
    }
    
    messages.push({ role: "user", content: message });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({ model: model, messages: messages, stream: false })
        });

        if (response.ok) {
            const data = await response.json();
            return res.json({ reply: data.choices[0].message.content });
        }
        
        return res.json({ reply: "Ошибка: " + response.status });
    } catch (e) {
        return res.json({ reply: "Ошибка связи" });
    }
});

app.listen(3000);
