local queueKey = KEYS[1]
local playerId = ARGV[1]
local minScore = tonumber(ARGV[2])
local maxScore = tonumber(ARGV[3])

-- Atomically verify the requesting player is still queued. The service checks
-- this separately, but between that check and this call another player's claim
-- may already have matched us, so without this guard a stale request could
-- claim a second opponent and put the player in two matches at once.
if not redis.call('ZSCORE', queueKey, playerId) then
  return nil
end

local candidates = redis.call('ZRANGEBYSCORE', queueKey, minScore, maxScore)

for _, candidateId in ipairs(candidates) do
  if candidateId ~= playerId then
    local removedCandidate = redis.call('ZREM', queueKey, candidateId)
    if removedCandidate == 1 then
      local candidateSocketId = redis.call('HGET', 'matchmaking_meta:' .. candidateId, 'socketId')
      redis.call('ZREM', queueKey, playerId)
      redis.call('DEL', 'matchmaking_meta:' .. candidateId)
      redis.call('DEL', 'matchmaking_meta:' .. playerId)
      return { candidateId, candidateSocketId or '' }
    end
  end
end

return nil