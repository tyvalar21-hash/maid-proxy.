const playerFacts = {};
const pendingConflicts = {};

function extractFacts(message, playerId) {
    if (!playerFacts[playerId]) playerFacts[playerId] = {};
    const facts = playerFacts[playerId];
    const msg = message.toLowerCase();

    const nameMatch = message.match(/(?:меня зовут|называй меня|зови меня|мо[её] имя)\s+([A-ZА-ЯЁ][a-zа-яё]+)/i);
    if (nameMatch) {
        const newName = nameMatch[1];
        if (facts.name && facts.name !== newName) {
            return { type: "conflict", field: "имя", oldValue: facts.name, newValue: newName };
        }
        facts.name = newName;
        return null;
    }

    const ageMatch = msg.match(/(?:мне|мой возраст)\s+(\d+)\s*(?:год|года|лет|годик)/i);
    if (ageMatch) {
        const newAge = ageMatch[1];
        if (facts.age && facts.age !== newAge) {
            return { type: "conflict", field: "возраст", oldValue: facts.age + " лет", newValue: newAge + " лет" };
        }
        facts.age = newAge;
        return null;
    }

    const fromMatch = message.match(/(?:я из|я с|я живу в|родом из|я вырос в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (fromMatch) {
        const newFrom = fromMatch[1].trim();
        if (facts.from && facts.from !== newFrom) {
            return { type: "conflict", field: "откуда", oldValue: facts.from, newValue: newFrom };
        }
        facts.from = newFrom;
        return null;
    }

    const langMatch = msg.match(/(?:я говорю на|мой язык|мой родной язык|я общаюсь на)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (langMatch) {
        const newLang = langMatch[1].trim();
        if (facts.language && facts.language !== newLang) {
            return { type: "conflict", field: "язык", oldValue: facts.language, newValue: newLang };
        }
        facts.language = newLang;
        return null;
    }

    const colorMatch = msg.match(/(?:мой любимый цвет|люблю цвет|мой цвет)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (colorMatch) { facts.color = colorMatch[1].trim(); return null; }

    const musicMatch = msg.match(/(?:моя любимая музыка|я люблю слушать|я слушаю)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (musicMatch) { facts.music = musicMatch[1].trim(); return null; }

    const nicknameMatch = message.match(/(?:зови меня|называй меня|обращайся ко мне)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (nicknameMatch) { facts.nickname = nicknameMatch[1].trim(); return null; }

    const friendMatch = msg.match(/(?:ты мой друг|ты моя подруга|мы друзья)/i);
    if (friendMatch) { facts.relationship = friendMatch[0].trim(); return null; }

    const partnerMatch = msg.match(/(?:у меня есть (?:парень|девушка)|я встречаюсь|я свободен|я свободна)/i);
    if (partnerMatch) { facts.partner = partnerMatch[0].trim(); return null; }

    const friendsMatch = msg.match(/(?:у меня (?:много|мало) друзей|я (?:общительный|одинокий))/i);
    if (friendsMatch) { facts.friends = friendsMatch[0].trim(); return null; }

    const robloxMatch = msg.match(/(?:я играю в роблокс|я не играю в роблокс|я часто играю)/i);
    if (robloxMatch) { facts.playsRoblox = robloxMatch[0].trim(); return null; }

    const gameMatch = msg.match(/(?:моя любимая игра|я люблю играть в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (gameMatch) { facts.favoriteGame = gameMatch[1].trim(); return null; }

    const eventMatch = msg.match(/(?:я купил|я переехал|я наш[её]л работу|у меня день рождения)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (eventMatch) {
        if (!facts.events) facts.events = [];
        facts.events.push(eventMatch[0].trim());
        if (facts.events.length > 5) facts.events.shift();
        return null;
    }

    return null;
}

function buildFactsString(playerId) {
    if (!playerFacts[playerId]) return "";
    const f = playerFacts[playerId];
    const parts = [];
    if (f.name) parts.push("Имя: " + f.name);
    if (f.nickname) parts.push("Обращение: " + f.nickname);
    if (f.age) parts.push("Возраст: " + f.age + " лет");
    if (f.from) parts.push("Откуда: " + f.from);
    if (f.language) parts.push("Язык: " + f.language);
    if (f.color) parts.push("Цвет: " + f.color);
    if (f.music) parts.push("Музыка: " + f.music);
    if (f.relationship) parts.push("Отношения: " + f.relationship);
    if (f.partner) parts.push("Статус: " + f.partner);
    if (f.friends) parts.push("Друзья: " + f.friends);
    if (f.playsRoblox) parts.push("Roblox: " + f.playsRoblox);
    if (f.favoriteGame) parts.push("Игра: " + f.favoriteGame);
    if (f.events && f.events.length > 0) parts.push("События: " + f.events.join(", "));
    if (parts.length === 0) return "";
    return "[ФАКТЫ]\n" + parts.join("\n") + "\n\n";
}

function setPendingConflict(playerId, conflict) { pendingConflicts[playerId] = conflict; }
function getPendingConflict(playerId) { return pendingConflicts[playerId]; }
function clearPendingConflict(playerId) { delete pendingConflicts[playerId]; }
function confirmFact(playerId, field, value) { if (!playerFacts[playerId]) playerFacts[playerId] = {}; playerFacts[playerId][field] = value; }
function initFacts(playerId) { if (!playerFacts[playerId]) playerFacts[playerId] = {}; }

module.exports = { extractFacts, buildFactsString, setPendingConflict, getPendingConflict, clearPendingConflict, confirmFact, initFacts };
