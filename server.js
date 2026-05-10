const express = require("express");
const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY_2 || "";

app.get("/", (req, res) => {
    res.send("OK");
});

app.post("/chat", async (req, res) => {
    if (!GROQ_API_KEY) {
        return res.json({ reply: "Ключ не задан" });
    }
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + GROQ_API_KEY
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Reply: OK" },
                    { role: "user", content: "test" }
                ],
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            return res.json({ reply: data.choices[0].message.content });
        }

        const errorText = await response.text();
        return res.json({ 
            reply: "Статус: " + response.status + " | Ответ: " + errorText.substring(0, 200)
        });

    } catch (e) {
        return res.json({ reply: "Ошибка: " + e.message });
    }
});

app.listen(3000);
