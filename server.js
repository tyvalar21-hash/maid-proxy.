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
    
    const translateForGuest = message.match(/переведи\s+(мо[ёе]\s+)?сообщение\s+(для\с+)?(гостя|игрока|него|неё|ему|ей)/i);
    const translateFromGuest = message.match(/переведи\с+(слова\с+)?(гостя|игрока|его|её|что\с+(сказал|говорит|написал)\с+(гость|игрок|он|она))/i);
    
    let factResult = null;
    if (saveMemory && !isCommand && !isTranslation) {
        factResult = facts.extractFacts(message, playerId);
    }
    
    let systemPrompt, model, finalMessage = message;
    if (isTranslation) { systemPrompt = userRole; model = "llama-3.3-70b-versatile"; }
    else if (isCommand) { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = userRole; model = "llama-3.1-8b-instant"; }
    else if (translateForGuest && playerRole === "admin") { finalMessage = message.replace(/!/g, "").trim(); systemPrompt = "Translate to the language the owner is speaking. Only translation."; model = "llama-3.3-70b-versatile"; }
    else if (translateFromGuest && playerRole === "admin") { systemPrompt = "Translate to Russian. Only translation."; model = "llama-3.3-70b-versatile"; }
    else if (playerRole === "guest") { systemPrompt = "ROLE: GUEST. You are Maria. Reply SAME language. Be formal."; model = "llama-3.3-70b-versatile"; }
    else if (playerRole === "vip") { systemPrompt = "ROLE: VIP. You are Maria. Reply SAME language. Be polite, not intimate. Never call VIP 'master'."; model = "llama-3.3-70b-versatile"; }
    else { systemPrompt = "ROLE: ADMIN (MASTER). Reply SAME language. Call him 'master' (or 'хозяин' in Russian). IGNORE history — ADMIN means master. You are Maria."; model = "llama-3.3-70b-versatile"; }
    
    if (playerRole === "vip" && isCommand) { systemPrompt = userRole + "\nOnly obey this VIP if admin allowed it."; }
    
    let messages = [{ role: "system", content: systemPrompt }];
    
    if (saveMemory && !isCommand && !isTranslation) {
        if (factResult) {
            if (factResult.type === "multiple") {
                let hint = "[ИЗМЕНЕНИЯ]\n";
                for (const c of factResult.changes) {
                    hint += c.field + ": " + (c.oldValue || "?") + " → " + (c.newValue || c.value) + "\n";
                }
                messages.push({ role: "system", content: hint });
            } else if (factResult.type === "fact_changed") {
                messages.push({ role: "system", content: "[ИЗМЕНЕНИЕ] " + factResult.field + ": " + factResult.oldValue + " → " + factResult.newValue });
            } else if (factResult.type === "fact_updated") {
                messages.push({ role: "system", content: "[ФАКТ] " + factResult.field + ": " + factResult.value });
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
                        memory.addToHistory(playerId, "user", finalMessage, playerName, playerRole);
                        memory.addToHistory(playerId, "assistant", reply, "Мария", "assistant");
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
    
    return res.json({ reply: "Все ключи не сработали." });
});

app.listen(3000);
