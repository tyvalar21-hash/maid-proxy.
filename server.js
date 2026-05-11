const express = require("express");
const app = express();
app.use(express.json());

const KEYS = [
    process.env.GROQ_API_KEY_2
].filter(Boolean);

let currentKeyIndex = 0;

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Maria Debug</title>
<style>
body{font-family:Arial;max-width:600px;margin:20px auto;padding:10px;background:#1a1a2e;color:#eee}
#chat{height:400px;overflow-y:auto;padding:10px;margin-bottom:10px;background:#16213e;border-radius:5px}
input{width:75%;padding:8px;background:#0f3460;color:#eee;border:1px solid #533483;border-radius:3px}
button{padding:8px 15px;background:#533483;color:#eee;border:none;border-radius:3px;cursor:pointer}
</style>
</head>
<body>
<h2>Maria Debug</h2>
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
    const key = KEYS[0];
    
    let message = req.body.message || "Hello";
    const history = req.body.history || [];
    
    let messages = [];
    messages.push({ role: "system", content: "You are Maria. Reply same language. Short." });
    
    for (const msg of history) {
        messages.push(msg);
    }
    
    messages.push({ role: "user", content: message });
    
    // Показываем, что отправляем
    console.log("SENDING TO GROQ:", JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages }));
    
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, stream: false })
        });

        if (response.ok) {
            const data = await response.json();
            return res.json({ reply: data.choices[0].message.content });
        }

        const errorText = await response.text();
        return res.json({ 
            reply: "ОШИБКА " + response.status + ": " + errorText.substring(0, 300)
        });

    } catch (e) {
        return res.json({ reply: "ОШИБКА СЕТИ: " + e.message });
    }
});

app.listen(3000);
