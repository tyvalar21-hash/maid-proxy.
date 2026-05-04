const express = require("express");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3
].filter(Boolean);

let currentKeyIndex = 0;

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

            if (response.status === 429) {
                currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
                continue;
            }

            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                return res.json({ reply: data.choices[0].message.content });
            }
            
            return res.json({ reply: "Ошибка: " + JSON.stringify(data) });
            
        } catch (e) {
            currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
        }
    }
    
    res.json({ reply: "Все ключи исчерпаны." });
});

app.listen(3000);
