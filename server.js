const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY_2 || "";

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/chat", async (req, res) => {
    let message = req.body.message || "Hello";
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_API_KEY },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Reply: OK" },
                    { role: "user", content: message }
                ],
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            return res.json({ reply: data.choices[0].message.content });
        }
        
        return res.json({ reply: "Ошибка: " + response.status });
    } catch (e) {
        return res.json({ reply: "Ошибка связи: " + e.message });
    }
});

app.listen(3000);
