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

function compressMessage(msg) {
    if (!msg || !msg.content) return { role: "user", content: "" };
    let content = msg.content;
    content = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (content.length > 50) {
        content = content.substring(0, 50);
    }
    return { role: msg.role, content: content };
}

app.post("/chat", async (req, res) => {
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    
    const isTranslation = userRole.toLowerCase().includes("translate");
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    if (!chatHistory[playerId]) chatHistory[playerId] = [];
    
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
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal.";
        model = "llama-3.3-70b-versatile";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (!isCommand && !isTranslation) {
        const history = chatHistory[playerId].slice(-10);
        for (const msg of history) {
            messages.push(compressMessage(msg));
        }
    }
    
    messages.push({ role: "user", content: finalMessage });
    
    let lastError = "";
    
    for (let attempt = 0; attempt < KEYS.length; attempt++) {
        const key = KEYS[currentKeyIndex];
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                body: JSON.stringify({ model: model, messages: messages, stream: false })
            });

            if (response.ok) {
                const data = await response.json();
                const reply = data.choices[0].message.content;
                
                if (!isCommand && !isTranslation) {
                    chatHistory[playerId].push({ role: "user", content: finalMessage });
                    chatHistory[playerId].push({ role: "assistant", content: reply });
                    if (chatHistory[playerId].length > 40) {
                        chatHistory[playerId] = chatHistory[playerId].slice(-40);
                    }
                }
                
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
