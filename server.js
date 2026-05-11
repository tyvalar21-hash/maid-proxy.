const express = require("express");
const app = express();
app.use(express.json());

const memory = require("./memory");
const facts = require("./facts");

const KEYS = [
    process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5, process.env.GROQ_API_KEY_6
].filter(Boolean);

let currentKeyIndex = 0;

app.post("/save-summary", async (req, res) => {
    const playerId = req.body.playerId || "unknown";
    const playerRole = req.body.playerRole || "guest";
    if (playerRole !== "admin" && playerRole !== "vip") return res.json({ status: "skipped" });
    if (!memory.hasHistory(playerId)) return res.json({ status: "empty" });
    const key = KEYS[currentKeyIndex];
    const summary = await memory.summarizeHistory(memory.getHistory(playerId), key);
    if (summary) {
        memory.clearHistory(playerId);
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
    
    if (saveMemory) {
        facts.initFacts(playerId);
    }
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;

    const pending = facts.getPendingConflict(playerId);
    if (pending && saveMemory) {
        const msgLower = message.toLowerCase();
        const confirmPatterns = ["да", "yes", "верно", "правильно", "ага", "ок", "хорошо", "я " + pending.newValue.toLowerCase()];
        let confirmed = false;
        for (const p of confirmPatterns) { if (msgLower.includes(p)) { confirmed = true; break; } }
        
        if (confirmed) {
            facts.confirmFact(playerId, pending.field === "имя" ? "name" : pending.field, pending.newValue);
            facts.clearPendingConflict(playerId);
            try {
                const key = KEYS[currentKeyIndex];
                const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                    body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: "You are Maria. Player confirmed new " + pending.field + ": " + pending.newValue + ". Accept naturally. One sentence." }, { role: "user", content: "Yes" }], stream: false })
                });
                if (r.ok) { const d = await r.json(); if (d.choices) return res.json({ reply: d.choices[0].message.content }); }
            } catch (e) {}
            return res.json({ reply: "Хорошо, запомнила: " + pending.newValue });
        }
        
        if (msgLower.includes("нет") || msgLower.includes("no")) {
            facts.clearPendingConflict(playerId);
            return res.json({ reply: "Хорошо, оставлю как было." });
        }
        facts.clearPendingConflict(playerId);
    }

    let factConflict = null;
    if (saveMemory && !isCommand && !isTranslation) {
        factConflict = facts.extractFacts(message, playerId);
    }
    
    if (factConflict && factConflict.type === "conflict") {
        facts.setPendingConflict(playerId, factConflict);
        try {
            const key = KEYS[currentKeyIndex];
            const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
                body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: "You are Maria. Player changed " + factConflict.field + " from " + factConflict.oldValue + " to " + factConflict.newValue + ". React naturally with surprise. One sentence." }, { role: "user", content: factConflict.newValue }], stream: false })
            });
            if (r.ok) { const d = await r.json(); if (d.choices) return res.json({ reply: d.choices[0].message.content }); }
        } catch (e) {}
        return res.json({ reply: "Подождите, но вы же говорили " + factConflict.oldValue + ". Почему " + factConflict.newValue + "?" });
    }

    let systemPrompt, model, finalMessage = message;
    if (isTranslation) { systemPrompt = userRole; model = "llama-3.3-70b-versatile"; }
    else if (isCommand) { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = userRole; model = "llama-3.1-8b-instant"; }
    else { systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal."; model = "llama-3.3-70b-versatile"; }

    let messages = [{ role: "system", content: systemPrompt }];
    
    if (saveMemory && !isCommand && !isTranslation) {
        const fs = facts.buildFactsString(playerId);
        if (fs) messages.push({ role: "system", content: fs });
        const summary = memory.getSummary(playerId);
        if (summary) messages.push({ role: "system", content: "[ПАМЯТЬ] " + summary });
        for (const msg of memory.getHistory(playerId)) messages.push(memory.compressMessage(msg));
    }
    
    messages.push({ role: "user", content: finalMessage });

    let lastError = "";
    for (let attempt = 0; attempt < KEYS.length; attempt++) {
        const key = KEYS[currentKeyIndex];
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
                        memory.addToHistory(playerId, "user", finalMessage);
                        memory.addToHistory(playerId, "assistant", reply);
                        await memory.maybeSummarize(playerId, key);
                    }
                    return res.json({ reply });
                }
            }
            if (r.status === 429) { lastError = "Ключ " + (currentKeyIndex + 1) + " лимит"; currentKeyIndex = (currentKeyIndex + 1) % KEYS.length; continue; }
            lastError = "Ошибка " + r.status; currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
        } catch (e) { lastError = "Сеть"; currentKeyIndex = (currentKeyIndex + 1) % KEYS.length; }
    }
    return res.json({ reply: "Все ключи не сработали. " + lastError });
});

app.listen(3000);
