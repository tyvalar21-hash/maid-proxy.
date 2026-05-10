const express = require("express");
const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY_1 || "";

// Встроенная HTML-страница
app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Maria Test</title>
<style>
body { font-family:Arial; max-width:600px; margin:20px auto; padding:10px; }
#chat { border:1px solid #ccc; height:400px; overflow-y:auto; padding:10px; margin-bottom:10px; }
input { width:80%; padding:8px; } button { padding:8px 15px; }
</style>
</head>
<body>
<h2>Maria Memory Test</h2>
<div id="chat"></div>
<input id="msg" placeholder="Type message..."><button onclick="send()">Send</button>
<script>
let history = [];
function addMsg(role, text) {
    let d = document.createElement("div");
    d.innerHTML = "<b>" + (role==="user"?"You":"Maria") + ":</b> " + text;
    document.getElementById("chat").appendChild(d);
}
async function send() {
    let input = document.getElementById("msg");
    let msg = input.value.trim();
    if (!msg) return;
    addMsg("user", msg);
    input.value = "";
    try {
        let r = await fetch("/chat", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                message: msg,
                history: history.slice(-10),
                role: "You are Maria, a maid. Reply same language. Short.",
                playerRole: "admin",
                playerId: "test",
                playerName: "Test"
            })
        });
        let data = await r.json();
        addMsg("assistant", data.reply);
        history.push({role:"user",content:msg});
        history.push({role:"assistant",content:data.reply});
    } catch(e) {
        addMsg("assistant", "Error: " + e.message);
    }
}
</script>
</body>
</html>
    `);
});

app.post("/chat", async (req, res) => {
    if (!GROQ_API_KEY) {
        return res.json({ reply: "Ключ не задан." });
    }
    
    let message = req.body.message || "Hello";
    const history = req.body.history || [];
    
    let messages = [];
    messages.push({ role: "system", content: "You are Maria, a devoted maid. Reply in SAME language. Be short." });
    
    for (const msg of history) {
        messages.push(msg);
    }
    
    messages.push({ role: "user", content: message });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_API_KEY },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, stream: false })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                return res.json({ reply: data.choices[0].message.content });
            }
            return res.json({ reply: "Пустой ответ" });
        }

        return res.json({ reply: "Ошибка Groq (" + response.status + ")." });

    } catch (e) {
        return res.json({ reply: "Ошибка связи." });
    }
});

app.listen(3000);
