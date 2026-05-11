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

function compressMessage(msg) {
    if (!msg || !msg.content) return { role: "user", content: "" };
    let content = msg.content;
    content = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (content.length > 30) {
        content = content.substring(0, 30);
    }
    return { role: msg.role, content: content };
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
    
    const isTranslation = (userRole.indexOf("Translate") === 0 || userRole.indexOf("translate") === 0);
    const saveMemory = (playerRole === "admin" || playerRole === "vip");
    
    if (saveMemory && !chatHistory[playerId]) chatHistory[playerId] = [];
    if (saveMemory && !chatSummary[playerId]) chatSummary[playerId] = "";
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    let systemPrompt, model, finalMessage = message;
    if (isTranslation) { systemPrompt = userRole; model = "llama-3.3-70b-versatile"; }
    else if (isCommand) { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = userRole; model = "llama-3.1-8b-instant"; }
    else { systemPrompt = "Maria, a maid. Reply same language. Short."; model = "llama-3.3-70b-versatile"; }
    
    let messages = [{ role: "system", content: systemPrompt }];
    
    // История временно отключена для проверки
    // if (saveMemory && !isCommand && !isTranslation) {
    //     const history = chatHistory[playerId].slice(-10);
    //     for (const msg of history) messages.push(compressMessage(msg));
    // }
    
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
