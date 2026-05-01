const express = require("express");
const app = express();
app.use(express.json());

const DEEPSEEK_KEY = "AIzaSyAwqiw3TZYbECM32K-_5llrSjZc85H4TTA";

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
