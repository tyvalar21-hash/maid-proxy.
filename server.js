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

const MAX_OPERATIVE = 50;

function shouldRemember(playerRole) {
    return playerRole === "admin" || playerRole === "vip";
}

app.post("/chat", async (req, res) => {
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    
    let message = req.body.message || "Hello";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    
    const saveMemory = shouldRemember(playerRole);
    
    if (saveMemory && !chatHistory[playerId]) {
        chatHistory[playerId] = [];
    }
    
    console.log("=== MSG ===");
    console.log("PlayerId:", playerId);
    console.log("PlayerRole:", playerRole);
    console.log("SaveMemory:", saveMemory);
    console.log("History BEFORE:", saveMemory ? chatHistory[playerId].length : "N/A");
    
    let systemPrompt = "You are Maria, a cute maid. Reply in the SAME language as the user. Be short and natural.";
    let model = "llama-3.3-70b-versatile";
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (saveMemory) {
        const recentHistory = chatHistory[playerId].slice(-10);
        console.log("Adding to prompt:", recentHistory.length, "messages");
        for (const oldMsg of recentHistory) {
            messages.push(oldMsg);
        }
    }
    
    messages.push({ role: "user", content: message });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + key
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            const reply = data.choices[0].message.content;
            
            if (saveMemory) {
                chatHistory[playerId].push({ role: "user", content: message });
                chatHistory[playerId].push({ role: "assistant", content: reply });
                console.log("History AFTER:", chatHistory[playerId].length);
            }
            
            return res.json({ reply: reply });
        }
        
        return res.json({ reply: "Ошибка: " + response.status });
    } catch (e) {
        return res.json({ reply: "Ошибка связи" });
    }
});

app.listen(3000);
