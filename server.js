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
    if (!playerFacts[playerId]) {
        playerFacts[playerId] = {};
    }
    
    const facts = playerFacts[playerId];
    const msg = message.toLowerCase();
    
    // Имя — только если есть явное "меня зовут", "называй меня", "мое имя"
    const nameMatch = message.match(/(?:меня зовут|называй меня|зови меня|мо[её] имя)\s+([A-ZА-ЯЁ][a-zа-яё]+)/i);
    if (nameMatch) {
        const newName = nameMatch[1];
        if (facts.name && facts.name !== newName) {
            return { type: "conflict", field: "имя", oldValue: facts.name, newValue: newName };
        }
        facts.name = newName;
        return null;
    }
    
    // Возраст
    const ageMatch = msg.match(/(?:мне|мой возраст)\s+(\d+)\s*(?:год|года|лет|годик)/i);
    if (ageMatch) {
        const newAge = ageMatch[1];
        if (facts.age && facts.age !== newAge) {
            return { type: "conflict", field: "возраст", oldValue: facts.age + " лет", newValue: newAge + " лет" };
        }
        facts.age = newAge;
        return null;
    }
    
    // Откуда
    const fromMatch = message.match(/(?:я из|я с|я живу в|родом из|я вырос в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (fromMatch) {
        const newFrom = fromMatch[1].trim();
        if (facts.from && facts.from !== newFrom) {
            return { type: "conflict", field: "откуда", oldValue: facts.from, newValue: newFrom };
        }
        facts.from = newFrom;
        return null;
    }
    
    // Язык
    const langMatch = msg.match(/(?:я говорю на|мой язык|мой родной язык|я общаюсь на)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (langMatch) {
        const newLang = langMatch[1].trim();
        if (facts.language && facts.language !== newLang) {
            return { type: "conflict", field: "язык", oldValue: facts.language, newValue: newLang };
        }
        facts.language = newLang;
        return null;
    }
    
    // Любимый цвет
    const colorMatch = msg.match(/(?:мой любимый цвет|люблю цвет|мой цвет)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (colorMatch) {
        facts.color = colorMatch[1].trim();
        return null;
    }
    
    // Любимая еда
    const foodMatch = msg.match(/(?:моя любимая еда|люблю есть|я люблю поесть|моё любимое блюдо)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (foodMatch) {
        facts.food = foodMatch[1].trim();
        return null;
    }
    
    // Псевдоним
    const nicknameMatch = message.match(/(?:зови меня|называй меня|обращайся ко мне)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (nicknameMatch) {
        facts.nickname = nicknameMatch[1].trim();
        return null;
    }
    
    return null;
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
    if (f.food) parts.push("Любимая еда: " + f.food);
    
    if (parts.length === 0) return "";
    return "[ФАКТЫ ОБ ИГРОКЕ]\n" + parts.join("\n") + "\n\n";
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

app.post("/save-summary", async (req, res) => {
    const playerId = req.body.playerId || "unknown";
    const playerRole = req.body.playerRole || "guest";
    
    if (playerRole !== "admin" && playerRole !== "vip") {
        return res.json({ status: "skipped" });
    }
    
    if (!chatHistory[playerId] || chatHistory[playerId].length === 0) {
        return res.json({ status: "empty" });
    }
    
    const key = KEYS[currentKeyIndex];
    const summary = await summarizeHistory(chatHistory[playerId], key);
    
    if (summary) {
        if (chatSummary[playerId]) {
            chatSummary[playerId] += " " + summary;
        } else {
            chatSummary[playerId] = summary;
        }
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
    
    if (saveMemory && !chatHistory[playerId]) {
        chatHistory[playerId] = [];
    }
    if (saveMemory && !chatSummary[playerId]) {
        chatSummary[playerId] = "";
    }
    if (saveMemory && !playerFacts[playerId]) {
        playerFacts[playerId] = {};
    }
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    const translateForGuest = message.match(/переведи\s+(мо[ёе]\s+)?сообщение\s+(для\s+)?(гостя|игрока|него|неё|ему|ей)/i);
    const translateFromGuest = message.match(/переведи\s+(слова\s+)?(гостя|игрока|его|её|что\s+(сказал|говорит|написал)\s+(гость|игрок|он|она))/i);
    
    let factConflict = null;
    if (saveMemory && !isCommand && !isTranslation) {
        factConflict = extractFacts(message, playerId);
    }
    
    if (factConflict && factConflict.type === "conflict") {
        const reply = "Подождите, но вы же говорили, что вас зовут " + factConflict.oldValue + ". Почему " + factConflict.newValue + "?";
        return res.json({ reply: reply });
    }
    
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
    
    if (saveMemory && !isCommand && !isTranslation) {
        const factsStr = buildFactsString(playerId);
        if (factsStr) {
            messages.push({ role: "system", content: factsStr });
        }
    }
    
    if (saveMemory && !isCommand && !isTranslation) {
        if (chatSummary[playerId]) {
            messages.push({ role: "system", content: "[ПАМЯТЬ] " + chatSummary[playerId] });
        }
        const history = chatHistory[playerId].slice(-40);
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
                    
                    if (saveMemory && !isCommand && !isTranslation) {
                        chatHistory[playerId].push({ role: "user", content: finalMessage });
                        chatHistory[playerId].push({ role: "assistant", content: reply });
                        
                        if (chatHistory[playerId].length >= 100) {
                            const oldMessages = chatHistory[playerId].splice(0, 50);
                            summarizeHistory(oldMessages, key).then(summary => {
                                if (summary) {
                                    if (chatSummary[playerId]) {
                                        chatSummary[playerId] += " " + summary;
                                    } else {
                                        chatSummary[playerId] = summary;
                                    }
                                }
                            });
                        }
                        
                        if (chatHistory[playerId].length > 80) {
                            chatHistory[playerId] = chatHistory[playerId].slice(-80);
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
