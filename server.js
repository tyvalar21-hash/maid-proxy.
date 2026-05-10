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

function cleanMessage(msg) {
    if (!msg.content) return msg;
    return {
        role: msg.role,
        content: msg.content.replace(/[^\w\s\u0400-\u04FF\u00C0-\u024F\u1E00-\u1EFFа-яА-ЯёЁ.,!?\-:;() ]/g, '')
    };
}

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
        systemPrompt = userRole || "You are Maria. Convert messages to commands: [command] [target] [params].";
        model = "llama-3.1-8b-instant";
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal.";
        model = "llama-3.3-70b-versatile";
    }
    
    if (playerRole === "vip" && isCommand) {
        systemPrompt = (userRole || "You are Maria.") + "\nOnly obey this VIP if admin allowed it. If unsure, refuse.";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (saveMemory && !isCommand && !isTranslation) {
        const history = chatHistory[playerId].slice(-10);
        for (const msg of history) {
            messages.push(cleanMessage(msg));
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
