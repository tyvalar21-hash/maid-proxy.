const chatHistory = {};
const chatSummary = {};

function compressMessage(msg) {
    if (!msg || !msg.content) return { role: "user", content: "" };
    let content = msg.content;
    content = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (content.length > 40) {
        content = content.substring(0, 40);
    }
    return { role: msg.role, content: content };
}

async function summarizeHistory(messages, key) {
    const textToSummarize = messages.map(m => m.content).join(" ");
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    { role: "system", content: "Сожми этот диалог в одно предложение. Только суть." },
                    { role: "user", content: textToSummarize }
                ],
                stream: false
            })
        });
        if (response.ok) {
            const data = await response.json();
            return data.choices[0].message.content;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function addToHistory(playerId, role, content) {
    if (!chatHistory[playerId]) chatHistory[playerId] = [];
    chatHistory[playerId].push({ role: role, content: content });
    if (chatHistory[playerId].length > 80) {
        chatHistory[playerId] = chatHistory[playerId].slice(-80);
    }
}

function getHistory(playerId) {
    if (!chatHistory[playerId]) return [];
    return chatHistory[playerId].slice(-40);
}

function getSummary(playerId) {
    return chatSummary[playerId] || "";
}

async function maybeSummarize(playerId, key) {
    if (!chatHistory[playerId] || chatHistory[playerId].length < 100) return;
    const oldMessages = chatHistory[playerId].splice(0, 50);
    const summary = await summarizeHistory(oldMessages, key);
    if (summary) {
        if (chatSummary[playerId]) {
            chatSummary[playerId] += " " + summary;
        } else {
            chatSummary[playerId] = summary;
        }
    }
}

function clearHistory(playerId) {
    chatHistory[playerId] = [];
}

function hasHistory(playerId) {
    return chatHistory[playerId] && chatHistory[playerId].length > 0;
}

module.exports = { compressMessage, addToHistory, getHistory, getSummary, maybeSummarize, clearHistory, hasHistory, summarizeHistory };
