const express = require("express");
const app = express();
app.use(express.json());

const GROQ_KEY = "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";

app.post("/chat", async (req, res) => {
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + GROQ_KEY
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: req.body.role || "Ты Анна." },
                    { role: "user", content: req.body.message || "Привет" }
                ]
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0]) {
            res.json({ reply: data.choices[0].message.content });
        } else {
            res.json({ reply: "Ошибка: " + JSON.stringify(data) });
        }
    } catch (e) {
        res.json({ reply: "Ошибка: " + e.message });
    }
});

app.listen(3000);
