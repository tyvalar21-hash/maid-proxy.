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
<head><meta charset="UTF-8"><title>Maria</title>
<style>
body{font-family:Arial;max-width:600px;margin:20px auto;padding:10px;background:#1a1a2e;color:#eee}
#chat{height:400px;overflow-y:auto;padding:10px;margin-bottom:10px;background:#16213e;border-radius:5px}
input{width:75%;padding:8px;background:#0f3460;color:#eee;border:1px solid #533483;border-radius:3px}
button{padding:8px 15px;background:#533483;color:#eee;border:none;border-radius:3px;cursor:pointer}
</style>
</head>
<body>
<h2>Maria Test</h2>
<div id="chat"></div>
<input id="msg" placeholder="Напиши..."><button onclick="send()">Send</button>
<script>
let history=[];
function addMsg(role,text){let d=document.createElement("div");d.innerHTML="<b>"+(role==="user"?"You":"Maria")+":</b> "+text;document.getElementById("chat").appendChild(d)}
async function send(){
let input=document.getElementById("msg");let msg=input.value.trim();if(!msg)return;
addMsg("user",msg);input.value="";
try{
let r=await fetch("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg,history:history.slice(-10),role:"test",playerRole:"admin",playerId:"test",playerName:"Test"})});
let data=await r.json();addMsg("assistant",data.reply);history.push({role:"user",content:msg});history.push({role:"assistant",content:data.reply})
}catch(e){addMsg("assistant","Error: "+e.message)}
}
</script>
</body>
</html>`);
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
    const saveMemory = (playerRole === "admin" || playerRole === "vip");
    
    if (saveMemory && !chatHistory[playerId]) {
        chatHistory[playerId] = [];
    }
    
    const match = message.match(/!\s*!/);
    const isCommand = match !== null;
    
    const translateForGuest = message.match(/переведи\s+(мо[ёе]\s+)?сообщение\s+(для\s+)?(гостя|игрока|него|неё|ему|ей)/i);
    const translateFromGuest = message.match(/переведи\s+(слова\s+)?(гостя|игрока|его|её|что\s+(сказал|говорит|написал)\s+(гость|игрок|он|она))/i);
    
    let systemPrompt;
    let model;
    let finalMessage = message;
    
    if (isTranslation) {
        finalMessage = message;
        systemPrompt = userRole;
        model = "llama-3.3-70b-versatile";
    } else if (isCommand) {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = userRole;
        model = "llama-3.1-8b-instant";
    } else if (translateForGuest && playerRole === "admin") {
        finalMessage = message.replace(/!/g, "").trim();
        systemPrompt = "Translate to the language the owner is speaking. Only translation.";
        model = "llama-3.3-70b-versatile";
    } else if (translateFromGuest && playerRole === "admin") {
        systemPrompt = "Translate to Russian. Only translation.";
        model = "llama-3.3-70b-versatile";
    } else {
        systemPrompt = "You are Maria, a devoted maid. The admin is your master. Call him 'master' (or 'хозяин' in Russian, 'tuan' in Indonesian, 'amo' in Spanish). You already know all the players. Never introduce yourself. Never say 'I am your maid' or 'how can I help you'. Just talk naturally like you've known them forever. Reply in the SAME language the user writes. Keep answers short and natural. Be cute and loyal.";
        model = "llama-3.3-70b-versatile";
    }
    
    if (playerRole === "vip" && isCommand) {
        systemPrompt = userRole + "\nOnly obey this VIP if admin allowed it. If unsure, refuse.";
    }
    
    let messages = [];
    messages.push({ role: "system", content: systemPrompt });
    
    const history = req.body.history || (saveMemory ? chatHistory[playerId].slice(-10) : []);
    
    if (saveMemory && !isCommand && !isTranslation && !translateForGuest && !translateFromGuest) {
        for (const msg of history) {
            messages.push(msg);
        }
    }
    
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
                const reply = data.choices[0].message.content;
                
                if (saveMemory && !isCommand && !isTranslation && !translateForGuest && !translateFromGuest) {
                    chatHistory[playerId].push({ role: "user", content: finalMessage });
                    chatHistory[playerId].push({ role: "assistant", content: reply });
                    if (chatHistory[playerId].length > 48) {
                        chatHistory[playerId] = chatHistory[playerId].slice(-48);
                    }
                }
                
                return res.json({ reply: reply });
            }
            return res.json({ reply: "Ошибка Groq: пустой ответ" });
        }

        if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After") || "5";
            const waitSeconds = parseInt(retryAfter) || 5;
            const waitTime = waitSeconds >= 60 
                ? `${Math.ceil(waitSeconds / 60)} мин` 
                : `${waitSeconds} сек`;
            return res.json({ reply: "Ключ " + keyNumber + " исчерпал лимит. Ждать " + waitTime + "." });
        }

        return res.json({ reply: "Ошибка Groq (" + response.status + ")." });

    } catch (e) {
        return res.json({ reply: "Прокси не может соединиться с Groq." });
    }
});

app.listen(3000);
