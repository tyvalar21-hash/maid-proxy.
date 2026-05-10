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
const chatSummaries = {};
const chatBlocks = {};

const playerFacts = {};
const pendingConfirmations = {};

const MAX_OPERATIVE = 50;
const BLOCK_SIZE = 50;
const MAX_BLOCKS = 2000;

const guestMessages = {};
const MAX_GUEST_MESSAGES = 10;
const guestMessageOrder = [];

const searchTriggers = [
    "что я говорил", "что ты сказала", "найди в истории",
    "помнишь", "давно", "в прошлый раз", "тогда",
    "раньше", "поиск", "!!история", "что было",
    "какой мой", "что ты знаешь", "расскажи обо мне",
    "помнишь ли ты", "что я люблю", "что мне нравится",
    "какой у меня", "мои предпочтения", "что ты запомнила",
    "как меня зовут", "сколько мне лет", "откуда я",
    "какой у меня язык", "что ты обо мне знаешь"
];

function shouldRemember(playerRole) {
    return playerRole === "admin" || playerRole === "vip";
}

function extractFactFromMessage(message, playerId, playerRole) {
    if (!shouldRemember(playerRole)) return null;
    if (!playerFacts[playerId]) {
        playerFacts[playerId] = { name: "", age: "", from: "", language: "", robloxName: "" };
    }
    
    const msg = message.toLowerCase();
    
    const nameMatch = message.match(/(?:меня зовут|называй меня|зови меня)\s+([A-ZА-ЯЁ][a-zа-яё]+)/i);
    if (nameMatch && !playerFacts[playerId].name) {
        return { type: "name", value: nameMatch[1] };
    }
    if (nameMatch && playerFacts[playerId].name) {
        return { type: "nickname", value: nameMatch[1] };
    }
    
    const ageMatch = msg.match(/(?:мне|мой возраст)\s+(\d+)\s*(?:год|года|лет|годик)/i);
    if (ageMatch && !playerFacts[playerId].age) {
        return { type: "age", value: ageMatch[1] };
    }
    
    const fromMatch = message.match(/(?:я из|я с|я живу в|родом из|я вырос в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (fromMatch && !playerFacts[playerId].from) {
        return { type: "from", value: fromMatch[1].trim() };
    }
    
    const langMatch = msg.match(/(?:я говорю на|мой язык|мой родной язык|я общаюсь на)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (langMatch && !playerFacts[playerId].language) {
        return { type: "language", value: langMatch[1].trim() };
    }
    
    return null;
}

function applyFact(playerId, factType, value) {
    if (!playerFacts[playerId]) return;
    
    switch (factType) {
        case "name":
        case "nickname":
            playerFacts[playerId].name = value;
            break;
        case "age":
            playerFacts[playerId].age = value;
            break;
        case "from":
            playerFacts[playerId].from = value;
            break;
        case "language":
            playerFacts[playerId].language = value;
            break;
    }
}

function buildFactsString(playerId, playerRole) {
    if (!shouldRemember(playerRole)) return "";
    if (!playerFacts[playerId]) return "";
    
    const f = playerFacts[playerId];
    const parts = [];
    
    if (f.robloxName) parts.push(`Настоящее имя (Roblox): ${f.robloxName}`);
    if (f.name && f.name !== f.robloxName) parts.push(`Предпочитаемое имя: ${f.name}`);
    else if (f.name) parts.push(`Имя: ${f.name}`);
    if (f.age) parts.push(`Возраст: ${f.age} лет`);
    if (f.from) parts.push(`Откуда: ${f.from}`);
    if (f.language) parts.push(`Язык: ${f.language}`);
    
    return parts.length > 0 ? "[ФАКТЫ ОБ ИГРОКЕ]\n" + parts.join("\n") + "\n\n" : "";
}

async function createSummary(messages, key) {
    const textToSummarize = messages.map(m => `${m.role}: ${m.content}`).join("\n");
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + key
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Сделай краткий конспект этого диалога на русском языке. Только суть, не более 2 предложений." },
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

function searchBlocks(playerId, query) {
    if (!chatBlocks[playerId]) return null;
    
    const blocks = chatBlocks[playerId];
    const queryLower = query.toLowerCase();
    const results = [];
    
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.summary.toLowerCase().includes(queryLower)) {
            results.push({ index: i, summary: block.summary, messages: block.messages });
        }
    }
    
    return results.length > 0 ? results.slice(0, 3) : null;
}

app.post("/chat", async (req, res) => {
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    const keyNumber = currentKeyIndex + 1;
    
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    const playerName = req.body.playerName || "";
    
    const isTranslation = userRole.toLowerCase().includes("translate");
    const saveMemory = shouldRemember(playerRole);
    
    if (saveMemory) {
        if (!chatHistory[playerId]) chatHistory[playerId] = [];
        if (!chatSummaries[playerId]) chatSummaries[playerId] = "";
        if (!chatBlocks[playerId]) chatBlocks[playerId] = [];
        if (!playerFacts[playerId]) {
            playerFacts[playerId] = { name: "", age: "", from: "", language: "", robloxName: "" };
        }
        if (playerName && !playerFacts[playerId].robloxName) {
            playerFacts[playerId].robloxName = playerName;
            if (!playerFacts[playerId].name) {
                playerFacts[playerId].name = playerName;
            }
        }
    }
    
    if (pendingConfirmations[playerId] && saveMemory) {
        const pending = pendingConfirmations[playerId];
        const msgLower = message.toLowerCase();
        
        if (msgLower === "да" || msgLower === "yes" || msgLower === "подтверждаю" || msgLower === "верно" || msgLower === "ага" || msgLower === "ок") {
            applyFact(playerId, pending.type, pending.value);
            delete pendingConfirmations[playerId];
            const confirmMsg = pending.type === 'name' || pending.type === 'nickname' 
                ? `✅ Запомнила! Буду звать вас ${pending.value}.` 
                : `✅ Запомнила!`;
            return res.json({ reply: confirmMsg });
        }
        
        if (msgLower === "нет" || msgLower === "no" || msgLower === "неверно" || msgLower === "отмена") {
            delete pendingConfirmations[playerId];
            return res.json({ reply: "Хорошо, забыли. Что на самом деле?" });
        }
        
        delete pendingConfirmations[playerId];
    }
    
    const extractedFact = extractFactFromMessage(message, playerId, playerRole);
    if (extractedFact && saveMemory) {
        pendingConfirmations[playerId] = extractedFact;
        
        let question = "";
        switch (extractedFact.type) {
            case "name":
                question = `Ваш Roblox-ник ${playerFacts[playerId].robloxName}. Вы хотите, чтобы я называла вас ${extractedFact.value}?`;
                break;
            case "nickname":
                question = `Вы хотите, чтобы я называла вас ${extractedFact.value} вместо ${playerFacts[playerId].name}?`;
                break;
            case "age":
                question = `Вам действительно ${extractedFact.value} лет? Я запомню это.`;
                break;
            case "from":
                question = `Вы из ${extractedFact.value}? Я запомню.`;
                break;
            case "language":
                question = `Ваш язык — ${extractedFact.value}? Я запомню.`;
                break;
        }
        
        return res.json({ reply: `🤔 ${question} (да/нет)` });
    }
    
    if (playerRole === "guest" && !isTranslation) {
        guestMessages[playerId] = message;
        if (!guestMessageOrder.includes(playerId)) guestMessageOrder.push(playerId);
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
    
    let isSearchQuery = false;
    if (!isCommand && !isTranslation && saveMemory) {
        for (const trigger of searchTriggers) {
            if (message.toLowerCase().includes(trigger)) {
                isSearchQuery = true;
                break;
            }
        }
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (saveMemory) {
        const factsStr = buildFactsString(playerId, playerRole);
        if (factsStr) {
            messages.push({ role: "system", content: factsStr });
        }
    }
    
    if (!isCommand && !isTranslation && !translateForGuest && !translateFromGuest && saveMemory) {
        const recentHistory = chatHistory[playerId].slice(-10);
        for (const oldMsg of recentHistory) {
            messages.push(oldMsg);
        }
    }
    
    messages.push({ role: "user", content: finalMessage });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + key
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                const reply = data.choices[0].message.content;
                
                if (saveMemory) {
                    chatHistory[playerId].push({ role: "user", content: finalMessage });
                    chatHistory[playerId].push({ role: "assistant", content: reply });
                    if (chatHistory[playerId].length > MAX_OPERATIVE * 2) {
                        chatHistory[playerId] = chatHistory[playerId].slice(-MAX_OPERATIVE * 2);
                    }
                }
                
                return res.json({ reply: reply });
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
