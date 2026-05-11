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
    let message = req.body.message || "Hello";
    const playerId = req.body.playerId || "unknown";
    
    if (!chatHistory[playerId]) chatHistory[playerId] = [];
    
    let messages = [
        { role: "system", content: "You are Maria, a maid. Reply same language. Short." }
    ];
    
    const history = chatHistory[playerId].slice(-10);
    for (const msg of history) messages.push(msg);
    
    messages.push({ role: "user", content: message });
    
    let lastError = "";
    
    for (let attempt = 0; attempt < KEYS.length; attempt++) {
        const key = KEYS[currentKeyIndex];
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, stream: false })
            });

            if (response.ok) {
                const data = await response.json();
                const reply = data.choices[0].message.content;
                
                chatHistory[playerId].push({ role: "user", content: message });
                chatHistory[playerId].push({ role: "assistant", content: reply });
                
                return res.json({ reply: reply });
            }

            if (response.status === 429) {
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                continue;
            }
            
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
            continue;

        } catch (e) {
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
            continue;
        }
    }
    
    return res.json({ reply: "Ошибка связи" });
});

app.listen(3000);
