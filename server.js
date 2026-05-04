const express = require("express");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3
].filter(Boolean);

let currentKeyIndex = 0;

// Хранилище последних сообщений гостей (playerId -> последнее сообщение)
const guestMessages = {};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.post("/chat", async (req, res) => {
    let message = req.body.message || "Привет";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    
    // ГОСТЬ — сохраняем сообщение и молчим
    if (playerRole === "guest") {
        guestMessages[playerId] = message;
        return res.json({ reply: "" });
    }
    
    // Проверяем, команда ли это
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    // Проверяем, просит ли админ перевести
    const translateForGuest = message.match(/переведи\s+(мо[ёе]\s+)?сообщение\s+(для\s+)?(гостя|игрока|него|неё|ему|ей)/i);
    const translateFromGuest = message.match(/переведи\s+(слова\s+)?(гостя|игрока|его|её|что\s+(сказал|говорит|написал)\s+(гость|игрок|он|она))/i);
    
    let systemPrompt;
    let model;
    let finalMessage = message;
    
    if (isCommand) {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = userRole;
        model = "llama-3.1-8b-instant";
        
    } else if (translateForGuest && playerRole === "admin") {
        // Админ просит перевести ЕГО сообщение гостю
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = "Переведи сообщение хозяина на тот же язык, на котором говорит хозяин. Только перевод, без лишних слов.";
        model = "llama-3.3-70b-versatile";
        
    } else if (translateFromGuest && playerRole === "admin") {
        // Админ просит перевести слова гостя
        // Ищем последнее сообщение любого гостя
        let guestMsg = "";
        for (const [id, msg] of Object.entries(guestMessages)) {
            guestMsg = msg;
            break;
        }
        if (guestMsg) {
            finalMessage = "Переведи это сообщение от гостя на русский: " + guestMsg;
        } else {
            return res.json({ reply: "Гость ничего не говорил." });
        }
        systemPrompt = "Ты переводчик. Переведи сообщение гостя на русский язык. Только перевод.";
        model = "llama-3.3-70b-versatile";
        
    } else {
        systemPrompt = "Ты Мария, дружелюбная служанка. Отвечай кратко, на том же языке что и хозяин. Без команд и скобок.";
        model = "llama-3.3-70b-versatile";
    }
    
    // VIP команды
    if (playerRole === "vip" && isCommand) {
        systemPrompt = userRole + "\nТы слушаешься этого VIP только если админ разрешил. Если не уверена — откажи.";
    }
    
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
                    model: model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: finalMessage }
                    ],
                    stream: false
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.choices && data.choices[0]) {
                    return res.json({ reply: data.choices[0].message.content });
                }
                return res.json({ reply: "Ошибка: " + JSON.stringify(data) });
            }

            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After") || "5";
                const waitSeconds = parseInt(retryAfter) || 5;
                
                if (attempt === KEYS.length - 1) {
                    const waitTime = waitSeconds >= 60 
                        ? `${Math.ceil(waitSeconds / 60)} мин` 
                        : `${waitSeconds} сек`;
                    return res.json({ reply: `Все ключи исчерпаны. Подожди ${waitTime}.` });
                }
                
                await sleep(waitSeconds * 1000);
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                continue;
            }

            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
            
        } catch (e) {
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
        }
    }
    
    res.json({ reply: "Все ключи исчерпаны. Попробуй позже." });
});

app.listen(3000);
