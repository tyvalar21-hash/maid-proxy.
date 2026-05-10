const express = require("express");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
    process.env.GROQ_API_KEY_6,
    process.env.GROQ_API_KEY_7,
    process.env.GROQ_API_KEY_8,
    process.env.GROQ_API_KEY_9,
    process.env.GROQ_API_KEY_10
].filter(Boolean);

let currentKeyIndex = 0;

const guestMessages = {};
const MAX_GUEST_MESSAGES = 10;
const guestMessageOrder = [];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    
    if (playerRole === "guest" && !isTranslation) {
        guestMessages[playerId] = message;
        
        if (!guestMessageOrder.includes(playerId)) {
            guestMessageOrder.push(playerId);
        }
        
        while (guestMessageOrder.length > MAX_GUEST_MESSAGES) {
            const oldId = guestMessageOrder.shift();
            delete guestMessages[oldId];
        }
        
        return res.json({ reply: "" });
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
        systemPrompt = userRole || "You are Maria. Convert messages to commands: [command] [target] [params].";
        model = "llama-3.1-8b-instant";
        
    } else if (translateForGuest && playerRole === "admin") {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = "Translate to the language the owner is speaking. Only translation.";
        model = "llama-3.3-70b-versatile";
        
    } else if (translateFromGuest && playerRole === "admin") {
        let guestMsg = "";
        for (const [id, msg] of Object.entries(guestMessages)) {
            guestMsg = msg;
            break;
        }
        if (guestMsg) {
            finalMessage = "Translate this guest message to Russian: " + guestMsg;
        } else {
            return res.json({ reply: "Guest hasn't said anything." });
        }
        systemPrompt = "Translate to Russian. Only translation.";
        model = "llama-3.3-70b-versatile";
        
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal.";
        model = "llama-3.3-70b-versatile";
    }
    
    if (playerRole === "vip" && isCommand) {
        systemPrompt = (userRole || "You are Maria.") + "\nOnly obey this VIP if admin allowed it. If unsure, refuse.";
    }
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + key
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: finalMessage }
                ],
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                return res.json({ reply: data.choices[0].message.content });
            }
            return res.json({ reply: "❌ Ошибка Groq: пустой ответ" });
        }

        if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After") || "5";
            const waitSeconds = parseInt(retryAfter) || 5;
            const waitTime = waitSeconds >= 60 
                ? `${Math.ceil(waitSeconds / 60)} мин` 
                : `${waitSeconds} сек`;
            return res.json({ 
                reply: `⏳ Ключ ${keyNumber} исчерпал лимит. Ждать ${waitTime}.` 
            });
        }

        if (response.status === 403) {
            return res.json({ reply: `❌ Ключ ${keyNumber} недействителен (403).` });
        }
        
        if (response.status === 401) {
            return res.json({ reply: `❌ Ключ ${keyNumber} не авторизован (401).` });
        }

        return res.json({ reply: `❌ Ошибка Groq (${response.status}).` });

    } catch (e) {
        return res.json({ reply: `❌ Прокси не может соединиться с Groq.` });
    }
});

app.listen(3000);
