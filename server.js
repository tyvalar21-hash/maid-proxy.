const express = require("express");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3
].filter(Boolean);

let currentKeyIndex = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.post("/chat", async (req, res) => {
    for (let attempt = 0; attempt < KEYS.length; attempt++) {
        const key = KEYS[currentKeyIndex];
        
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + key
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: req.body.role || "Ты Мария." },
                        { role: "user", content: req.body.message || "Привет" }
                    ]
                })
            });

            // Успех — возвращаем ответ
            if (response.ok) {
                const data = await response.json();
                if (data.choices && data.choices[0]) {
                    return res.json({ reply: data.choices[0].message.content });
                }
                return res.json({ reply: "Ошибка: " + JSON.stringify(data) });
            }

            // Лимит исчерпан — ЖДЁМ, сколько сказали
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After") || "5";
                const waitSeconds = parseInt(retryAfter) || 5;
                
                console.log(`Ключ ${currentKeyIndex + 1}: лимит. Жду ${waitSeconds} сек...`);
                
                // Если это последний ключ — сообщаем игроку
                if (attempt === KEYS.length - 1) {
                    const waitTime = waitSeconds >= 60 
                        ? `${Math.ceil(waitSeconds / 60)} мин` 
                        : `${waitSeconds} сек`;
                    return res.json({ reply: `Все ключи исчерпаны. Подожди ${waitTime}.` });
                }
                
                // Ждём и пробуем следующий ключ
                await sleep(waitSeconds * 1000);
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                continue;
            }

            // Другая ошибка — пробуем следующий ключ без ожидания
            console.log(`Ключ ${currentKeyIndex + 1}: ошибка ${response.status}`);
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
            
        } catch (e) {
            console.log(`Ключ ${currentKeyIndex + 1}: ошибка соединения`);
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
        }
    }
    
    res.json({ reply: "Все ключи исчерпаны. Попробуй позже." });
});

app.listen(3000);
