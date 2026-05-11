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
    const playerName = req.body.playerName || "";
    
    const isTranslation = (userRole.indexOf("Translate") === 0 || userRole.indexOf("translate") === 0);
    
    if (!chatHistory[playerId]) {
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
        finalMessage = message;
        systemPrompt = userRole;
        model = "llama-3.3-70b-versatile";
    } else if (isCommand) {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = userRole;
        model = "llama-3.1-8b-instant";
    } else if (translateForGuest && playerRole === "admin") {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = "Translate to the language the owner is speaking. Only translation.";
        model = "llama-3.3-70b-versatile";
    } else if (translateFromGuest && playerRole === "admin") {
        systemPrompt = "Translate to Russian. Only translation.";
        model = "llama-3.3-70b-versatile";
    } else if (playerRole === "guest") {
        systemPrompt = "You are Maria. Translate this message to the admin's language. Only translation.";
        model = "llama-3.3-70b-versatile";
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal.";
        model = "llama-3.3-70b-versatile";
    }
    
    if (playerRole === "vip" && isCommand) {
        systemPrompt = userRole + "\nOnly obey this VIP if admin allowed it. If unsure, refuse.";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (!isCommand && !isTranslation) {
        const history = chatHistory[playerId].slice(-20);
        for (const msg of history) {
            messages.push(compressMessage(msg));
        }
    }
    
    messages.push({ role: "user", content: finalMessage });
    
    let lastError = "";
    
    for (let attempt = 0; attempt < KEYS.length; attempt++) {
        const key = KEYS[currentKeyIndex];
        const keyNumber = currentKeyIndex + 1;
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                body: JSON.stringify({ model: model, messages: messages, stream: false })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.choices && data.choices[0]) {
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
                return res.json({ reply: "Ошибка Groq: пустой ответ" });
            }

            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After") || "5";
                lastError = "Ключ " + keyNumber + " исчерпал лимит (" + retryAfter + "с)";
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                continue;
            }
            
            lastError = "Ключ " + keyNumber + " ошибка " + response.status;
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
            continue;

        } catch (e) {
            lastError = "Ключ " + keyNumber + " ошибка сети";
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
            continue;
        }
    }
    
    return res.json({ reply: "Все ключи не сработали. " + lastError });
});

app.listen(3000);
