
const express = require("express");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
    process.env.GROQ_API_KEY_6
].filter(Boolean);

let currentKeyIndex = 0;
const chatHistory = {};

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
        let context = "";
        let recent = history.slice(-6);
        for (const m of recent) {
            context += (m.role === "user" ? "User: " : "Maria: ") + m.content + "\\n";
        }
        let fullMsg = context ? context + "User: " + msg : msg;
        
        let r = await fetch("/chat", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                message: fullMsg,
                role: "test",
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
    currentKeyIndex = (currentKeyIndex + 1) % KEYS.length;
    const key = KEYS[currentKeyIndex];
    const keyNumber = currentKeyIndex + 1;
    
    let message = req.body.message || "Hello";
    const userRole = req.body.role || "";
    const playerRole = req.body.playerRole || "guest";
    const playerId = req.body.playerId || "unknown";
    const playerName = req.body.playerName || "";
    
    const isTranslation = userRole.toLowerCase().includes("translate");
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    let systemPrompt;
    let model;
    let finalMessage = message;
    
    if (isTranslation) {
        systemPrompt = userRole;
        model = "llama-3.3-70b-versatile";
    } else if (isCommand) {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = userRole;
        model = "llama-3.1-8b-instant";
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master'. Reply in SAME language. Be short.";
        model = "llama-3.3-70b-versatile";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: finalMessage });
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({ model: model, messages: messages, stream: false })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                return res.json({ reply: data.choices[0].message.content });
            }
            return res.json({ reply: "Ошибка Groq: пустой ответ" });
        }

        if (response.status === 429) {
            return res.json({ reply: "Ключ " + keyNumber + " исчерпал лимит." });
        }

        return res.json({ reply: "Ошибка Groq (" + response.status + ")." });

    } catch (e) {
        return res.json({ reply: "Прокси не может соединиться с Groq." });
    }
});

app.listen(3000);
