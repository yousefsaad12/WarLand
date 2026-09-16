-- KEYS[1] = matchmaking_queue
-- ARGV[1] = playerId
-- ARGV[2] = minScore
-- ARGV[3] = maxScore

local queueKey = KEYS[1]
local playerId = ARGV[1]
local minScore = tonumber(ARGV[2])
local maxScore = tonumber(ARGV[3])

local candidates = redis.call('ZRANGEBYSCORE', queueKey, minScore, maxScore)

for _, candidateId in ipairs(candidates) do
  if candidateId ~= playerId then
    local removed = redis.call('ZREM', queueKey, candidateId)

    if removed == 1 then
      redis.call('DEL', 'matchmaking_meta:' .. candidateId)
      redis.call('DEL', 'matchmaking_meta:' .. playerId)
      return candidateId
    end
  end
end

return nil