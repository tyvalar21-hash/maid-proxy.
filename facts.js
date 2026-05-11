const playerFacts = {};

function extractFacts(message, playerId) {
    if (!playerFacts[playerId]) playerFacts[playerId] = {};
    const facts = playerFacts[playerId];
    const msg = message.toLowerCase();

    // Имя — только явное представление
    const nameMatch = message.match(/(?:меня зовут|называй меня|зови меня|мо[её] имя)\s+([A-ZА-ЯЁ][a-zа-яё]+)/i);
    if (nameMatch) {
        facts.name = nameMatch[1];
        return { type: "fact_updated", field: "имя", value: facts.name };
    }

    // Возраст
    const ageMatch = msg.match(/(?:мне|мой возраст)\s+(\d+)\s*(?:год|года|лет|годик)/i);
    if (ageMatch) {
        facts.age = ageMatch[1];
        return { type: "fact_updated", field: "возраст", value: facts.age + " лет" };
    }

    // Откуда
    const fromMatch = message.match(/(?:я из|я с|я живу в|родом из|я вырос в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (fromMatch) {
        facts.from = fromMatch[1].trim();
        return { type: "fact_updated", field: "откуда", value: facts.from };
    }

    // Язык
    const langMatch = msg.match(/(?:я говорю на|мой язык|мой родной язык|я общаюсь на)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (langMatch) {
        facts.language = langMatch[1].trim();
        return { type: "fact_updated", field: "язык", value: facts.language };
    }

    // Любимый цвет
    const colorMatch = msg.match(/(?:мой любимый цвет|люблю цвет|мой цвет)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (colorMatch) {
        facts.color = colorMatch[1].trim();
        return { type: "fact_updated", field: "цвет", value: facts.color };
    }

    // Любимая музыка
    const musicMatch = msg.match(/(?:моя любимая музыка|я люблю слушать|я слушаю)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (musicMatch) {
        facts.music = musicMatch[1].trim();
        return { type: "fact_updated", field: "музыка", value: facts.music };
    }

    // Псевдоним
    const nicknameMatch = message.match(/(?:зови меня|называй меня|обращайся ко мне)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (nicknameMatch) {
        facts.nickname = nicknameMatch[1].trim();
        return { type: "fact_updated", field: "псевдоним", value: facts.nickname };
    }

    // Отношения
    const friendMatch = msg.match(/(?:ты мой друг|ты моя подруга|мы друзья)/i);
    if (friendMatch) {
        facts.relationship = friendMatch[0].trim();
        return { type: "fact_updated", field: "отношения", value: facts.relationship };
    }

    // Парень/девушка
    const partnerMatch = msg.match(/(?:у меня есть (?:парень|девушка)|я встречаюсь|я свободен|я свободна)/i);
    if (partnerMatch) {
        facts.partner = partnerMatch[0].trim();
        return { type: "fact_updated", field: "статус", value: facts.partner };
    }

    // Друзья
    const friendsMatch = msg.match(/(?:у меня (?:много|мало) друзей|я (?:общительный|одинокий))/i);
    if (friendsMatch) {
        facts.friends = friendsMatch[0].trim();
        return { type: "fact_updated", field: "друзья", value: facts.friends };
    }

    // Roblox
    const robloxMatch = msg.match(/(?:я играю в роблокс|я не играю в роблокс|я часто играю)/i);
    if (robloxMatch) {
        facts.playsRoblox = robloxMatch[0].trim();
        return { type: "fact_updated", field: "роблокс", value: facts.playsRoblox };
    }

    // Любимая игра
    const gameMatch = msg.match(/(?:моя любимая игра|я люблю играть в)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (gameMatch) {
        facts.favoriteGame = gameMatch[1].trim();
        return { type: "fact_updated", field: "игра", value: facts.favoriteGame };
    }

    // События
    const eventMatch = msg.match(/(?:я купил|я переехал|я наш[её]л работу|у меня день рождения)\s+(.+?)(?:\.|\,|\s*$)/i);
    if (eventMatch) {
        if (!facts.events) facts.events = [];
        facts.events.push(eventMatch[0].trim());
        if (facts.events.length > 5) facts.events.shift();
        return { type: "fact_updated", field: "событие", value: eventMatch[0].trim() };
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

function initFacts(playerId) { if (!playerFacts[playerId]) playerFacts[playerId] = {}; }

module.exports = { extractFacts, buildFactsString, initFacts };
