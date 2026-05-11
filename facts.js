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

    const foodMatch = msg.match(/(?:моя любимая еда|люблю есть|я люблю поесть|моё любимое блюдо)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (foodMatch) { facts.food = foodMatch[1].trim(); return null; }

    const nicknameMatch = message.match(/(?:зови меня|называй меня|обращайся ко мне)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (nicknameMatch) { facts.nickname = nicknameMatch[1].trim(); return null; }

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
    if (f.color) parts.push("Любимый цвет: " + f.color);
    if (f.food) parts.push("Любимая еда: " + f.food);
    if (parts.length === 0) return "";
    return "[ФАКТЫ ОБ ИГРОКЕ]\n" + parts.join("\n") + "\n\n";
}

function setPendingConflict(playerId, conflict) {
    pendingConflicts[playerId] = conflict;
}

function getPendingConflict(playerId) {
    return pendingConflicts[playerId];
}

function clearPendingConflict(playerId) {
    delete pendingConflicts[playerId];
}

function confirmFact(playerId, field, value) {
    if (!playerFacts[playerId]) playerFacts[playerId] = {};
    playerFacts[playerId][field] = value;
}

function initFacts(playerId) {
    if (!playerFacts[playerId]) playerFacts[playerId] = {};
}

module.exports = { extractFacts, buildFactsString, setPendingConflict, getPendingConflict, clearPendingConflict, confirmFact, initFacts };
