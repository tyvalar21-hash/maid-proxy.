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

// ПАМЯТЬ ДЛЯ ВСЕХ
const chatHistory = {};

app.post("/chat", async (req, res) => {
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    
    let message = req.body.message || "Hello";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    
    console.log("MSG:", message, "| ROLE:", playerRole, "| ID:", playerId);
    
    if (!chatHistory[playerId]) chatHistory[playerId] = [];
    
    // Системный промпт (короткий для теста)
    let systemPrompt = "You are Maria, a cute maid. Reply in the SAME language as the user. Be short and natural.";
    
    // Собираем сообщения
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    // Добавляем историю
    for (const oldMsg of chatHistory[playerId]) {
        messages.push(oldMsg);
    }
    
    // Добавляем текущее сообщение
    messages.push({ role: "user", content: message });
    
    // Сохраняем сообщение пользователя в историю
    chatHistory[playerId].push({ role: "user", content: message });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + key
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: messages,
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            const reply = data.choices[0].message.content;
            
            // Сохраняем ответ в историю
            chatHistory[playerId].push({ role: "assistant", content: reply });
            
            // Держим только последние 10 сообщений
            if (chatHistory[playerId].length > 10) {
                chatHistory[playerId] = chatHistory[playerId].slice(-10);
            }
            
            console.log("REPLY:", reply);
            console.log("HISTORY LENGTH:", chatHistory[playerId].length);
            
            return res.json({ reply: reply });
        }
        
        console.log("ERROR:", response.status);
        return res.json({ reply: "Ошибка: " + response.status });
    } catch (e) {
        console.log("EXCEPTION:", e.message);
        return res.json({ reply: "Ошибка связи" });
    }
});

app.listen(3000);
