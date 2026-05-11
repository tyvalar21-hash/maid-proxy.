const playerFacts = {};
const pendingConflicts = {};

function extractFacts(message, playerId) {
    if (!playerFacts[playerId]) playerFacts[playerId] = {};
    const facts = playerFacts[playerId];
    const msg = message.toLowerCase();

    // Имя
    const nameMatch = message.match(/(?:меня зовут|называй меня|зови меня|мо[её] имя)\s+([A-ZА-ЯЁ][a-zа-яё]+)/i);
    if (nameMatch) {
        const newName = nameMatch[1];
        if (facts.name && facts.name !== newName) {
            return { type: "conflict", field: "имя", oldValue: facts.name, newValue: newName };
        }
        facts.name = newName;
        return null;
    }

    // Возраст
    const ageMatch = msg.match(/(?:мне|мой возраст)\s+(\d+)\s*(?:год|года|лет|годик)/i);
    if (ageMatch) {
        const newAge = ageMatch[1];
        if (facts.age && facts.age !== newAge) {
            return { type: "conflict", field: "возраст", oldValue: facts.age + " лет", newValue: newAge + " лет" };
        }
        facts.age = newAge;
        return null;
    }

    // Откуда
    const fromMatch = message.match(/(?:я из|я с|я живу в|родом из|я вырос в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (fromMatch) {
        const newFrom = fromMatch[1].trim();
        if (facts.from && facts.from !== newFrom) {
            return { type: "conflict", field: "откуда", oldValue: facts.from, newValue: newFrom };
        }
        facts.from = newFrom;
        return null;
    }

    // Язык
    const langMatch = msg.match(/(?:я говорю на|мой язык|мой родной язык|я общаюсь на)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (langMatch) {
        const newLang = langMatch[1].trim();
        if (facts.language && facts.language !== newLang) {
            return { type: "conflict", field: "язык", oldValue: facts.language, newValue: newLang };
        }
        facts.language = newLang;
        return null;
    }

    // Любимый цвет
    const colorMatch = msg.match(/(?:мой любимый цвет|люблю цвет|мой цвет)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (colorMatch) {
        facts.color = colorMatch[1].trim();
        return null;
    }

    // Любимая музыка
    const musicMatch = msg.match(/(?:моя любимая музыка|я люблю слушать|я слушаю|мой любимый трек|моя любимая группа)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (musicMatch) {
        facts.music = musicMatch[1].trim();
        return null;
    }

    // Псевдоним
    const nicknameMatch = message.match(/(?:зови меня|называй меня|обращайся ко мне)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (nicknameMatch) {
        facts.nickname = nicknameMatch[1].trim();
        return null;
    }

    // Отношения
    const friendMatch = msg.match(/(?:ты мой друг|ты моя подруга|ты мне как (?:брат|сестра)|мы друзья|я твой друг)/i);
    if (friendMatch) {
        facts.relationship = friendMatch[0].trim();
        return null;
    }

    // Парень/девушка
    const partnerMatch = msg.match(/(?:у меня есть (?:парень|девушка)|я встречаюсь с|я в отношениях|я свободен|я свободна|у меня нет (?:парня|девушки))/i);
    if (partnerMatch) {
        facts.partner = partnerMatch[0].trim();
        return null;
    }

    // Количество друзей
    const friendsCountMatch = msg.match(/(?:у меня (?:много|мало|(\d+)) друзей|я (?:общительный|одинокий)|у меня нет друзей)/i);
    if (friendsCountMatch) {
        facts.friends = friendsCountMatch[0].trim();
        return null;
    }

    // Играет в Roblox
    const robloxMatch = msg.match(/(?:я играю в роблокс|я не играю в роблокс|я часто играю|я редко играю|я каждый день играю)/i);
    if (robloxMatch) {
        facts.playsRoblox = robloxMatch[0].trim();
        return null;
    }

    // Любимая игра
    const gameMatch = msg.match(/(?:моя любимая игра|я люблю играть в|я обожаю)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (gameMatch) {
        facts.favoriteGame = gameMatch[1].trim();
        return null;
    }

    // Важные события
    const eventMatch = msg.match(/(?:я купил|я приобр[её]л|я переехал|я наш[её]л работу|я уволился|я заболел|я выздоровел|у меня день рождения|я женюсь|я выхожу замуж)\s+(.+?)(?:\.|\,|\s*$)/i);
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
    if (f.color) parts.push("Любимый цвет: " + f.color);
    if (f.music) parts.push("Любимая музыка: " + f.music);
    if (f.relationship) parts.push("Отношения: " + f.relationship);
    if (f.partner) parts.push("Статус: " + f.partner);
    if (f.friends) parts.push("Друзья: " + f.friends);
    if (f.playsRoblox) parts.push("Roblox: " + f.playsRoblox);
    if (f.favoriteGame) parts.push("Любимая игра: " + f.favoriteGame);
    if (f.events && f.events.length > 0) parts.push("События: " + f.events.join(", "));
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
