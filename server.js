const express = require("express");
const app = express();
app.use(express.json());

// Два ключа Groq
const KEYS = [
    "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",
    "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"
];

let currentKeyIndex = 0;
const MAX_RETRIES = KEYS.length;

async function askGroq(message, role) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
                        { role: "system", content: role || "Ты Мария." },
                        { role: "user", content: message || "Привет" }
                    ]
                })
            });

            // Если лимит исчерпан — переключаем ключ
            if (response.status === 429) {
                console.log("Ключ " + (currentKeyIndex + 1) + " исчерпан. Переключаю...");
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                continue;
            }

            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                return data.choices[0].message.content;
            }
            
            return "Ошибка: " + JSON.stringify(data);
            
        } catch (e) {
            console.log("Ошибка с ключом " + (currentKeyIndex + 1) + ": " + e.message);
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
        }
    }
    
    return "Все ключи исчерпаны. Попробуйте позже.";
}

app.post("/chat", async (req, res) => {
    const reply = await askGroq(
        req.body.message || "Привет",
        req.body.role || "Ты Мария."
    );
    res.json({ reply: reply });
});

app.listen(3000);
