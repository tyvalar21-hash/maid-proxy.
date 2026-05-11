const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());

const memory = require("./memory");
const facts = require("./facts");

const KEYS = [
    process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4, process.env.GROQ_API_KEY_5, process.env.GROQ_API_KEY_6
].filter(Boolean);

let currentKeyIndex = 0;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

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
    
    const translateForGuest = message.match(/переведи\s+(мо[ёе]\s+)?сообщение\s+(для\s+)?(гостя|игрока|него|неё|ему|ей)/i);
    const translateFromGuest = message.match(/переведи\s+(слова\s+)?(гостя|игрока|его|её|что\s+(сказал|говорит|написал)\s+(гость|игрок|он|она))/i);
    
    // Извлечение фактов
    let factResult = null;
    if (saveMemory && !isCommand && !isTranslation) {
        factResult = facts.extractFacts(message, playerId);
    }
    
    let systemPrompt, model, finalMessage = message;
    if (isTranslation) { systemPrompt = userRole; model = "llama-3.3-70b-versatile"; }
    else if (isCommand) { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = userRole; model = "llama-3.1-8b-instant"; }
    else if (translateForGuest && playerRole === "admin") { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = "Translate to the language the owner is speaking. Only translation."; model = "llama-3.3-70b-versatile"; }
    else if (translateFromGuest && playerRole === "admin") { systemPrompt = "Translate to Russian. Only translation."; model = "llama-3.3-70b-versatile"; }
    else if (playerRole === "guest") { systemPrompt = "You are Maria. Translate this message to the admin's language. Only translation."; model = "llama-3.3-70b-versatile"; }
    else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal. IMPORTANT: Never compare player facts with yourself. Never say 'my city', 'my age', 'like me', 'same as me'. Only state the player's facts.";
        model = "llama-3.3-70b-versatile";
    }
    
    if (playerRole === "vip" && isCommand) { systemPrompt = userRole + "\nOnly obey this VIP if admin allowed it. If unsure, refuse."; }
    
    let messages = [{ role: "system", content: systemPrompt }];
    
    if (saveMemory && !isCommand && !isTranslation) {
        if (factResult) {
            if (factResult.type === "multiple") {
                let hint = "[МНОЖЕСТВЕННОЕ ИЗМЕНЕНИЕ] Игрок изменил несколько фактов о себе:\n";
                for (const change of factResult.changes) {
                    if (change.type === "fact_changed") {
                        hint += "- " + change.field + ": было '" + change.oldValue + "', стало '" + change.newValue + "'\n";
                    } else {
                        hint += "- " + change.field + ": " + change.value + " (новый факт)\n";
                    }
                }
                hint += "Отреагируй естественно: удивись изменениям, спроси почему так много изменилось. Не отвергай новые значения.";
                messages.push({ role: "system", content: hint });
            } else if (factResult.type === "fact_changed") {
                const hint = "[ИЗМЕНЕНИЕ] Игрок изменил факт о себе: " + factResult.field + " было '" + factResult.oldValue + "', стало '" + factResult.newValue + "'. Отреагируй естественно: удивись, спроси почему изменилось. Не отвергай новое значение.";
                messages.push({ role: "system", content: hint });
            } else if (factResult.type === "fact_updated") {
                const hint = "[ОБНОВЛЕНИЕ] Игрок сообщил новый факт о себе: " + factResult.field + " = " + factResult.value + ". Используй это в ответе естественно.";
                messages.push({ role: "system", content: hint });
            }
        }
        
        const fs = facts.buildFactsString(playerId);
        if (fs) messages.push({ role: "system", content: fs });
        const summary = memory.getSummary(playerId);
        if (summary) messages.push({ role: "system", content: "[ПАМЯТЬ] " + summary });
        for (const msg of memory.getHistory(playerId)) messages.push(memory.compressMessage(msg));
    }
    
    messages.push({ role: "user", content: finalMessage });
    
    for (let attempt = 0; attempt < 3; attempt++) {
        const key = KEYS[currentKeyIndex];
        
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
                        memory.addToHistory(playerId, "user", finalMessage);
                        memory.addToHistory(playerId, "assistant", reply);
                        await memory.maybeSummarize(playerId, key);
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
