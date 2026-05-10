const express = require("express");
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
const chatHistory = {};

app.post("/chat", async (req, res) => {
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    const keyNumber = currentKeyIndex + 1;
    
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    
    const isTranslation = userRole.toLowerCase().includes("translate");
    const saveMemory = (playerRole === "admin" || playerRole === "vip");
    
    if (saveMemory && !chatHistory[playerId]) {
        chatHistory[playerId] = [];
    }
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    let systemPrompt;
    let model;
    
    if (isTranslation) {
        systemPrompt = userRole;
        model = "llama-3.3-70b-versatile";
    } else if (isCommand) {
        message = message.replace(/!/g, "").trim();
        systemPrompt = userRole || "Convert to [command] [target] [params].";
        model = "llama-3.1-8b-instant";
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Reply in SAME language. Be short.";
        model = "llama-3.3-70b-versatile";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (saveMemory && !isCommand && !isTranslation) {
        const history = chatHistory[playerId].slice(-10);
        for (const msg of history) {
            messages.push(msg);
        }
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
            const reply = data.choices[0].message.content;
            
            if (saveMemory && !isCommand && !isTranslation) {
                chatHistory[playerId].push({ role: "user", content: message });
                chatHistory[playerId].push({ role: "assistant", content: reply });
                if (chatHistory[playerId].length > 20) {
                    chatHistory[playerId] = chatHistory[playerId].slice(-20);
                }
            }
            
            return res.json({ reply: reply });
        }

        if (response.status === 429) {
            return res.json({ reply: "Ключ " + keyNumber + " исчерпал лимит." });
        }

        return res.json({ reply: "Ошибка: " + response.status });

    } catch (e) {
        return res.json({ reply: "Ошибка связи" });
    }
});

app.listen(3000);
