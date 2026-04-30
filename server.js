const express = require("express");
const app = express();
app.use(express.json());

const DEEPSEEK_KEY = "sk-c76e0075caf04c6ab0cdac9fbbfe3401"; // <- ВСТАВЬ СВОЙ НОВЫЙ КЛЮЧ ЗДЕСЬ

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

app.post("/chat", async (req, res) => {
    try {
        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + DEEPSEEK_KEY
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: req.body.role },
                    { role: "user", content: req.body.message }
                ],
                max_tokens: 100,
                temperature: 0.8
            })
        });
        
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (error) {
        res.json({ reply: "Ой, я отвлёкся... Повторите?" });
    }
});

app.listen(3000);
