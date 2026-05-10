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

function shouldRemember(playerRole) {
    return playerRole === "admin" || playerRole === "vip";
}

app.post("/chat", async (req, res) => {
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    const keyNumber = currentKeyIndex + 1;
    
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    
    const isTranslation = userRole.toLowerCase().includes("translate");
    const saveMemory = shouldRemember(playerRole);
    
    if (saveMemory && !chatHistory[playerId]) {
        chatHistory[playerId] = [];
    }
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    const translateForGuest = message.match(/переведи\s+(мо[ёе]\s+)?сообщение\s+(для\s+)?(гостя|игрока|него|неё|ему|ей)/i);
    const translateFromGuest = message.match(/переведи\s+(слова\s+)?(гостя|игрока|его|её|что\s+(сказал|говорит|написал)\s+(гость|игрок|он|она))/i);
    
    let systemPrompt;
    let model;
    let finalMessage = message;
    
    if (isTranslation) {
        systemPrompt = userRole;
        model = "llama-3.3-70b-versatile";
    } else if (isCommand) {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = userRole || "You are Maria. Convert messages to commands.";
        model = "llama-3.1-8b-instant";
    } else if (translateForGuest && playerRole === "admin") {
        systemPrompt = "Translate. Only translation.";
        model = "llama-3.3-70b-versatile";
    } else if (translateFromGuest && playerRole === "admin") {
        systemPrompt = "Translate to Russian. Only translation.";
        model = "llama-3.3-70b-versatile";
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal.";
        model = "llama-3.3-70b-versatile";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (saveMemory && !isCommand && !isTranslation) {
        const recentHistory = chatHistory[playerId].slice(-10);
        for (const oldMsg of recentHistory) {
            messages.push(oldMsg);
        }
    }
    
    messages.push({ role: "user", content: finalMessage });
    
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
            
            if (saveMemory && !isCommand && !isTranslation) {
                chatHistory[playerId].push({ role: "user", content: finalMessage });
                chatHistory[playerId].push({ role: "assistant", content: reply });
                if (chatHistory[playerId].length > 20) {
                    chatHistory[playerId] = chatHistory[playerId].slice(-20);
                }
            }
            
            return res.json({ reply: reply });
        }

        if (response.status === 429) {
            return res.json({ reply: `⏳ Ключ ${keyNumber} исчерпал лимит.` });
        }

        return res.json({ reply: "Ошибка: " + response.status });

    } catch (e) {
        return res.json({ reply: "Ошибка связи" });
    }
});

app.listen(3000);
