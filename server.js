local commandQueue = {}
local isQueueProcessing = false

local function processQueue()
    if isQueueProcessing then return end
    if #commandQueue == 0 then return end
    
    isQueueProcessing = true
    
    local entry = table.remove(commandQueue, 1)
    local player = entry.player
    local msg = entry.msg
    local playerRole = entry.playerRole
    
    processMessageInternal(player, msg, playerRole)
    
    isQueueProcessing = false
    task.spawn(processQueue)
end

local function enqueueMessage(player, msg, playerRole)
    if isProcessing then
        table.insert(commandQueue, {player = player, msg = msg, playerRole = playerRole})
        return
    end
    processMessageInternal(player, msg, playerRole)
end

local function processMessageInternal(player, msg, playerRole)
    isProcessing = true
    
    local timeoutThread = task.spawn(function()
        task.wait(25)
        if isProcessing then
            isProcessing = false
            bubbleEvent:FireAllClients("maria", "Мария", "Ошибка связи...", maria.Head.Position)
            isQueueProcessing = false
            task.spawn(processQueue)
        end
    end)
    
    if playerRole ~= "guest" and CommandHandler.isWaitingForLang() then
        local handled = CommandHandler.handleLangAnswer(player, msg)
        if handled then
            task.cancel(timeoutThread)
            isProcessing = false
            isQueueProcessing = false
            task.spawn(processQueue)
            return
        end
    end
    
    if playerRole == "guest" then
        if CommandHandler.isTranslatingMode() then
            bubbleEvent:FireAllClients("maria", "Мария", "...", maria.Head.Position)
            
            local lang1 = CommandHandler.getTranslateLang1() or "russian"
            local lang2 = CommandHandler.getTranslateLang2() or "indonesian"
            
            local body = HttpService:JSONEncode({
                message = msg,
                role = "Translate from " .. lang2 .. " to " .. lang1 .. ". Only the translation, nothing else.",
                playerRole = "guest",
                playerId = player.UserId
            })
            
            local ok, result = pcall(function()
                return HttpService:PostAsync(PROXY_URL, body, Enum.HttpContentType.ApplicationJson)
            end)
            
            if ok then
                local success, data = pcall(function()
                    return HttpService:JSONDecode(result)
                end)
                if success and data and data.reply and data.reply ~= "" then
                    local fullMsg = player.Name .. ": " .. data.reply
                    bubbleEvent:FireAllClients("maria", "Мария", fullMsg, maria.Head.Position)
                    historyEvent:FireAllClients("maria", fullMsg, data.reply)
                end
            end
            
            task.cancel(timeoutThread)
            isProcessing = false
            isQueueProcessing = false
            task.spawn(processQueue)
            return
        end
        
        local body = HttpService:JSONEncode({
            message = msg,
            playerRole = "guest",
            playerId = player.UserId
        })
        pcall(function()
            HttpService:PostAsync(PROXY_URL, body, Enum.HttpContentType.ApplicationJson)
        end)
        task.cancel(timeoutThread)
        isProcessing = false
        isQueueProcessing = false
        task.spawn(processQueue)
        return
    end
    
    if msg:match("!") then
        CommandHandler.setLastUserMsg(msg)
    end
    
    bubbleEvent:FireAllClients("maria", "Мария", "...", maria.Head.Position)
    
    local body
    if CommandHandler.isTranslatingMode() and not msg:match("!") then
        local status = MariaData:GetStatus(player)
        local lang1 = CommandHandler.getTranslateLang1() or "russian"
        local lang2 = CommandHandler.getTranslateLang2() or "indonesian"
        
        local sourceLang = lang1
        local targetLang = lang2
        if status ~= "Owner" then
            sourceLang = lang2
            targetLang = lang1
        end
        
        body = HttpService:JSONEncode({
            message = msg,
            role = "Translate from " .. sourceLang .. " to " .. targetLang .. ". Only the translation, nothing else.",
            playerRole = playerRole,
            playerId = player.UserId
        })
        
        local ok, result = pcall(function()
            return HttpService:PostAsync(PROXY_URL, body, Enum.HttpContentType.ApplicationJson)
        end)
        
        if ok then
            local success, data = pcall(function()
                return HttpService:JSONDecode(result)
            end)
            if success and data and data.reply and data.reply ~= "" then
                local fullMsg = player.Name .. ": " .. data.reply
                bubbleEvent:FireAllClients("maria", "Мария", fullMsg, maria.Head.Position)
                historyEvent:FireAllClients("maria", fullMsg, data.reply)
            end
        end
        
        task.cancel(timeoutThread)
        isProcessing = false
        isQueueProcessing = false
        task.spawn(processQueue)
        return
    else
        body = HttpService:JSONEncode({
            message = msg,
            role = MariaPrompt.SystemPrompt,
            playerRole = playerRole,
            playerId = player.UserId
        })
    end
    
    local ok, result = pcall(function()
        return HttpService:PostAsync(PROXY_URL, body, Enum.HttpContentType.ApplicationJson)
    end)
    
    if ok then
        local success, data = pcall(function()
            return HttpService:JSONDecode(result)
        end)
        if success and data and data.reply and data.reply ~= "" then
            local reply = data.reply
            if reply:match("All keys exhausted") or reply:match("TPM") or reply:match("RPD") or reply:match("Error:") then
                bubbleEvent:FireAllClients("maria", "Мария", reply, maria.Head.Position)
            else
                replyEvent:FireClient(player, reply)
                bubbleEvent:FireAllClients("maria", "Мария", reply, maria.Head.Position)
                historyEvent:FireAllClients("maria", reply, reply)
                if not CommandHandler.isWaitingForLang() and MariaData:CanCommand(player) then
                    CommandHandler.handle(reply, player)
                end
            end
        else
            bubbleEvent:FireAllClients("maria", "Мария", "Ошибка связи...", maria.Head.Position)
        end
    else
        bubbleEvent:FireAllClients("maria", "Мария", "Ошибка связи...", maria.Head.Position)
    end
    
    task.cancel(timeoutThread)
    isProcessing = false
    isQueueProcessing = false
    task.spawn(processQueue)
end
