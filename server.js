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

// Хранилище диалогов
const chatHistory = {};       // оперативная память: { playerId: [{role, content}, ...] }
const chatSummaries = {};     // долгосрочная память: { playerId: "конспект всего диалога" }
const chatBlocks = {};        // архив блоков: { playerId: [{summary, messages}, ...] }

const MAX_OPERATIVE = 50;     // оперативная память (последние 50 сообщений)
const BLOCK_SIZE = 50;        // размер блока для архивации
const MAX_BLOCKS = 2000;      // макс. блоков (50 × 2000 = 100,000 сообщений)

const guestMessages = {};
const MAX_GUEST_MESSAGES = 10;
const guestMessageOrder = [];

// Ключевые слова для поиска по истории
const searchTriggers = [
    "что я говорил", "что ты сказала", "найди в истории",
    "помнишь", "давно", "в прошлый раз", "тогда",
    "раньше", "поиск", "!!история", "что было"
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция для создания суммаризации через Groq
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

// Функция поиска по блокам (без нейросети)
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
    
    return results.length > 0 ? results.slice(0, 3) : null; // макс 3 блока
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
    
    // Инициализация хранилищ
    if (!chatHistory[playerId]) chatHistory[playerId] = [];
    if (!chatSummaries[playerId]) chatSummaries[playerId] = "";
    if (!chatBlocks[playerId]) chatBlocks[playerId] = [];
    
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
    
    // === ПРОВЕРКА НА ПОИСК ПО ИСТОРИИ ===
    let isSearchQuery = false;
    if (!isCommand && !isTranslation) {
        for (const trigger of searchTriggers) {
            if (message.toLowerCase().includes(trigger)) {
                isSearchQuery = true;
                break;
            }
        }
    }
    
    // === СБОРКА СООБЩЕНИЙ ===
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    if (!isCommand && !isTranslation && !translateForGuest && !translateFromGuest) {
        
        if (isSearchQuery && chatBlocks[playerId].length > 0) {
            // РЕЖИМ ПОИСКА: ищем в блоках
            const foundBlocks = searchBlocks(playerId, message);
            
            if (foundBlocks) {
                let searchContext = "[ИСТОРИЯ ДИАЛОГА]\n";
                if (chatSummaries[playerId]) {
                    searchContext += "Общий конспект: " + chatSummaries[playerId] + "\n\n";
                }
                searchContext += "Найденные блоки по запросу:\n";
                for (const block of foundBlocks) {
                    searchContext += "---\n" + block.messages.map(m => `${m.role}: ${m.content}`).join("\n") + "\n";
                }
                messages.push({ role: "system", content: searchContext });
            } else {
                messages.push({ role: "system", content: "[ПАМЯТЬ] " + (chatSummaries[playerId] || "Нет истории") });
            }
        } else {
            // ОБЫЧНЫЙ РЕЖИМ: конспект + оперативная память
            if (chatSummaries[playerId]) {
                messages.push({ role: "system", content: "[ПАМЯТЬ] " + chatSummaries[playerId] });
            }
            
            // Добавляем последние 50 сообщений (оперативная память)
            const recentHistory = chatHistory[playerId].slice(-MAX_OPERATIVE);
            for (const oldMsg of recentHistory) {
                messages.push(oldMsg);
            }
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
                
                // Сохраняем в оперативную память
                if (!isCommand && !isTranslation && !translateForGuest && !translateFromGuest && !isSearchQuery) {
                    chatHistory[playerId].push({ role: "user", content: finalMessage });
                    chatHistory[playerId].push({ role: "assistant", content: reply });
                    
                    // Если накопился целый блок — архивируем
                    if (chatHistory[playerId].length >= BLOCK_SIZE * 2) {
                        const blockMessages = chatHistory[playerId].splice(0, BLOCK_SIZE * 2);
                        
                        // Создаём суммаризацию блока (асинхронно, не ждём)
                        createSummary(blockMessages, key).then(summary => {
                            if (summary) {
                                chatBlocks[playerId].push({
                                    summary: summary,
                                    messages: blockMessages
                                });
                                
                                // Обновляем общий конспект
                                if (chatSummaries[playerId]) {
                                    chatSummaries[playerId] += " " + summary;
                                } else {
                                    chatSummaries[playerId] = summary;
                                }
                                
                                // Ограничиваем количество блоков
                                while (chatBlocks[playerId].length > MAX_BLOCKS) {
                                    chatBlocks[playerId].shift();
                                }
                            }
                        });
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
