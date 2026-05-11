const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5, process.env.GROQ_API_KEY_6
].filter(Boolean);

let currentKeyIndex = 0;
const chatHistory = {};
const chatSummary = {};
const playerFacts = {};

function compressMessage(msg) {
    if (!msg || !msg.content) return { role: "user", content: "" };
    let content = msg.content;
    content = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (content.length > 30) {
        content = content.substring(0, 30);
    }
    return { role: msg.role, content: content };
}

function extractFacts(message, playerId) {
    if (!playerFacts[playerId]) playerFacts[playerId] = {};
    const facts = playerFacts[playerId];
    const msg = message.toLowerCase();

    const nameMatch = message.match(/(?:меня зовут|называй меня|зови меня|мо[её] имя)\s+([A-ZА-ЯЁ][a-zа-яё]+)/i);
    if (nameMatch) { facts.name = nameMatch[1]; return; }

    const ageMatch = msg.match(/(?:мне|мой возраст)\s+(\d+)\s*(?:год|года|лет|годик)/i);
    if (ageMatch) { facts.age = ageMatch[1]; return; }

    const fromMatch = message.match(/(?:я из|я с|я живу в|родом из|я вырос в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (fromMatch) { facts.from = fromMatch[1].trim(); return; }

    const langMatch = msg.match(/(?:я говорю на|мой язык|мой родной язык|я общаюсь на)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (langMatch) { facts.language = langMatch[1].trim(); return; }

    const colorMatch = msg.match(/(?:мой любимый цвет|люблю цвет|мой цвет)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (colorMatch) { facts.color = colorMatch[1].trim(); return; }

    const nicknameMatch = message.match(/(?:зови меня|называй меня|обращайся ко мне)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (nicknameMatch) { facts.nickname = nicknameMatch[1].trim(); return; }
}

function buildFactsString(playerId) {
    if (!playerFacts[playerId]) return "";
    const f = playerFacts[playerId];
    const parts = [];
    if (f.name) parts.push("Имя: " + f.name);
    if (f.nickname) parts.push("Обращение: " + f.nickname);
    if (f.age) parts.push("Возраст: " + f.age + " лет");
    if (f.from) parts.push("Откуда: " + f.from);
    if (f.language) parts.push("Язык: " + f.language);
    if (f.color) parts.push("Любимый цвет: " + f.color);
    if (parts.length === 0) return "";
    return "[ФАКТЫ]\n" + parts.join("\n") + "\n\n";
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
    if (saveMemory && !playerFacts[playerId]) playerFacts[playerId] = {};
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    if (saveMemory && !isCommand && !isTranslation) {
        extractFacts(message, playerId);
    }
    
    let systemPrompt, model, finalMessage = message;
    if (isTranslation) { systemPrompt = userRole; model = "llama-3.3-70b-versatile"; }
    else if (isCommand) { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = userRole; model = "llama-3.1-8b-instant"; }
    else { systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal."; model = "llama-3.3-70b-versatile"; }
    
    if (playerRole === "vip" && isCommand) { systemPrompt = userRole + "\nOnly obey this VIP if admin allowed it. If unsure, refuse."; }
    
    let messages = [{ role: "system", content: systemPrompt }];
    
    if (saveMemory && !isCommand && !isTranslation) {
        // Факты временно отключены для проверки
        // const fs = buildFactsString(playerId);
        // if (fs) messages.push({ role: "system", content: fs });
        if (chatSummary[playerId]) messages.push({ role: "system", content: "[ПАМЯТЬ] " + chatSummary[playerId] });
        const history = chatHistory[playerId].slice(-40);
        for (const msg of history) messages.push(compressMessage(msg));
    }
    
    messages.push({ role: "user", content: finalMessage });
    
    let lastError = "";
    for (let attempt = 0; attempt < KEYS.length; attempt++) {
        const key = KEYS[currentKeyIndex];
        const keyNumber = currentKeyIndex + 1;
        try {
            const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                body: JSON.stringify({ model, messages, stream: false })
            });
            if (r.ok) {
                const d = await r.json();
                if (d.choices && d.choices[0]) {
                    const reply = d.choices[0].message.content;
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
            if (r.status === 429) { lastError = "Ключ " + keyNumber + " лимит"; currentKeyIndex = (currentKeyIndex + 1) % KEYS.length; continue; }
            lastError = "Ошибка " + r.status; currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
        } catch (e) { lastError = "Сеть"; currentKeyIndex = (currentKeyIndex + 1) % KEYS.length; }
    }
    return res.json({ reply: "Все ключи не сработали. " + lastError });
});

app.listen(3000);
