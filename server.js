const express = require("express");
const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY_2 || "";
const chatHistory = {};

app.post("/chat", async (req, res) => {
    let message = req.body.message || "Hello";
    const playerId = req.body.playerId || "unknown";
    
    if (!chatHistory[playerId]) chatHistory[playerId] = [];
    
    let messages = [
        { role: "system", content: "You are Maria, a maid. Reply same language. Short." }
    ];
    
    const history = chatHistory[playerId].slice(-10);
    for (const msg of history) messages.push(msg);
    
    messages.push({ role: "user", content: message });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_API_KEY },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, stream: false })
        });

        if (response.ok) {
            const data = await response.json();
            const reply = data.choices[0].message.content;
            
            chatHistory[playerId].push({ role: "user", content: message });
            chatHistory[playerId].push({ role: "assistant", content: reply });
            
            return res.json({ reply: reply + " (ID:" + playerId + ")" });
        }
        
        return res.json({ reply: "Ошибка: " + response.status });
    } catch (e) {
        return res.json({ reply: "Ошибка связи" });
    }
});

app.listen(3000);
