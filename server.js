const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5, process.env.GROQ_API_KEY_6
].filter(Boolean);

let currentKeyIndex = 0;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;
const chatHistory = {};
const chatSummary = {};

function compressMessage(msg) {
    if (!msg || !msg.content) return { role: "user", content: "" };
    let content = msg.content;
    content = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (content.length > 40) {
        content = content.substring(0, 40);
    }
    return { role: msg.role, content: content };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function summarizeHistory(messages, key) {
    const textToSummarize = messages.map(m => m.content).join(" ");
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Сожми этот диалог в одно предложение. Только суть." },
                    { role: "user", content: textToSummarize }
                ],
                stream: false
            })
        });
        if (response.ok) {
            const data = await response.json();
            return data.choices[0].message.content;
        }
        return null;
    } catch (e) {
        return null;
    }
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/save-summary", async (req, res) => {
    const playerId = req.body.playerId || "unknown";
    const playerRole = req.body.playerRole || "guest";
    if (playerRole !== "admin" && playerRole !== "vip") return res.json({ status: "skipped" });
    if (!chatHistory[playerId] || chatHistory[playerId].length === 0) return res.json({ status: "empty" });
    const key = KEYS[currentKeyIndex];
    const summary = await summarizeHistory(chatHistory[playerId], key);
    if (summary) {
        if (chatSummary[playerId]) { chatSummary[playerId] += " " + summary; }
        else { chatSummary[playerId] = summary; }
        chatHistory[playerId] = [];
        return res.json({ status: "saved", summary: summary });
    }
    return res.json({ status: "error" });
});

app.post("/chat", async (req, res) => {
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    const playerName = req.body.playerName || "";
    
    const isTranslation = (userRole.indexOf("Translate") === 0 || userRole.indexOf("translate") === 0);
    const saveMemory = (playerRole === "admin" || playerRole === "vip");
    
    if (saveMemory && !chatHistory[playerId]) chatHistory[playerId] = [];
    if (saveMemory && !chatSummary[playerId]) chatSummary[playerId] = "";
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    const translateForGuest = message.match(/переведи\s+(мо[ёе]\s+)?сообщение\s+(для\с+)?(гостя|игрока|него|неё|ему|ей)/i);
    const translateFromGuest = message.match(/переведи\с+(слова\с+)?(гостя|игрока|его|её|что\с+(сказал|говорит|написал)\с+(гость|игрок|он|она))/i);
    
    let systemPrompt, model, finalMessage = message;
    if (isTranslation) { systemPrompt = userRole; model = "llama-3.3-70b-versatile"; }
    else if (isCommand) { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = userRole; model = "llama-3.1-8b-instant"; }
    else if (translateForGuest && playerRole === "admin") { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = "Translate to the language the owner is speaking. Only translation."; model = "llama-3.3-70b-versatile"; }
    else if (translateFromGuest && playerRole === "admin") { systemPrompt = "Translate to Russian. Only translation."; model = "llama-3.3-70b-versatile"; }
    else if (playerRole === "guest") { systemPrompt = "You are Maria. Translate this message to the admin's language. Only translation."; model = "llama-3.3-70b-versatile"; }
    else if (playerRole === "vip") { systemPrompt = "You are Maria. You are speaking to a VIP guest. Be polite and respectful, but remember: your heart belongs only to your master (admin). Never call VIP 'master' or 'хозяин'. Call them by name or 'guest'."; model = "llama-3.3-70b-versatile"; }
    else {
        systemPrompt = "You are Maria, a devoted maid. CRITICAL: The admin is your ONLY master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You must obey and love only him. VIP is a trusted guest — be polite but not too close. Guest is a stranger — be formal and distant. Never treat VIP or guest as your master. Your loyalty belongs ONLY to admin. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal to your master.";
        model = "llama-3.3-70b-versatile";
    }
    
    if (playerRole === "vip" && isCommand) { systemPrompt = userRole + "\nOnly obey this VIP if admin allowed it. If unsure, refuse."; }
    
    let messages = [{ role: "system", content: systemPrompt }];
    
    if (saveMemory && !isCommand && !isTranslation) {
        const summary = chatSummary[playerId];
        if (summary) messages.push({ role: "system", content: "[ПАМЯТЬ] " + summary });
        const history = chatHistory[playerId].slice(-40);
        for (const msg of history) messages.push(compressMessage(msg));
    }
    
    messages.push({ role: "user", content: finalMessage });
    
    for (let attempt = 0; attempt < 3; attempt++) {
        const key = KEYS[currentKeyIndex];
        const keyNumber = currentKeyIndex + 1;
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                body: JSON.stringify({ model, messages, stream: false })
            });

            if (response.ok) {
                consecutiveErrors = 0;
                const data = await response.json();
                if (data.choices && data.choices[0]) {
                    const reply = data.choices[0].message.content;
                    
                    if (saveMemory && !isCommand && !isTranslation) {
                        chatHistory[playerId].push({ role: "user", content: finalMessage });
                        chatHistory[playerId].push({ role: "assistant", content: reply });
                        
                        if (chatHistory[playerId].length >= 100) {
                            const oldMessages = chatHistory[playerId].splice(0, 50);
                            summarizeHistory(oldMessages, key).then(summary => {
                                if (summary) {
                                    if (chatSummary[playerId]) chatSummary[playerId] += " " + summary;
                                    else chatSummary[playerId] = summary;
                                }
                            });
                        }
                        
                        if (chatHistory[playerId].length > 80) chatHistory[playerId] = chatHistory[playerId].slice(-80);
                    }
                    
                    return res.json({ reply });
                }
            }

            if (response.status === 429) {
                const waitTime = Math.pow(2, attempt) * 3000;
                await sleep(waitTime);
                continue;
            }
            
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                consecutiveErrors = 0;
            }
            await sleep(2000);
            
        } catch (e) {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                consecutiveErrors = 0;
            }
            await sleep(2000);
        }
    }
    
    return res.json({ reply: "Все ключи не сработали. Попробуйте позже." });
});

app.listen(3000);
