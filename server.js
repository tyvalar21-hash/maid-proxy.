console.log("=== MSG ===");
console.log("Message:", message);
console.log("PlayerRole:", playerRole);
console.log("PlayerId:", playerId);
console.log("SaveMemory:", saveMemory);
if (saveMemory) {
    console.log("History BEFORE:", chatHistory[playerId] ? chatHistory[playerId].length : "NO HISTORY");
}
