-- Seed the four starter cards. Card ids are stable slugs so that the id used
-- in the engine/frontend matches the artwork keys (knight, archer, guard,
-- scout). Stats mirror STARTER_CARDS in src/game/balance.ts.
INSERT INTO "Card" (
  "id", "name", "cost", "baseHp", "baseDamage",
  "attackSpeed", "movementSpeed", "range", "createdAt", "updatedAt"
)
VALUES
  ('knight', 'Knight', 3, 180, 14, 1.00,  6,  2, now(), now()),
  ('archer', 'Archer', 4,  85,  8, 1.25,  5, 11, now(), now()),
  ('guard',  'Guard',  4, 250, 10, 0.80,  4,  2, now(), now()),
  ('scout',  'Scout',  2,  70,  4, 1.50, 10,  2, now(), now())
ON CONFLICT ("id") DO UPDATE SET
  "name"          = EXCLUDED."name",
  "cost"          = EXCLUDED."cost",
  "baseHp"        = EXCLUDED."baseHp",
  "baseDamage"    = EXCLUDED."baseDamage",
  "attackSpeed"   = EXCLUDED."attackSpeed",
  "movementSpeed" = EXCLUDED."movementSpeed",
  "range"         = EXCLUDED."range",
  "updatedAt"     = now();

-- Repair any player that is missing cards (e.g. accounts registered before the
-- cards were seeded). Idempotent: duplicates are ignored.
INSERT INTO "PlayerCard" ("id", "playerId", "cardId", "level")
SELECT md5(random()::text || clock_timestamp()::text), p."id", c."id", 1
FROM "Player" p
CROSS JOIN "Card" c
ON CONFLICT ("playerId", "cardId") DO NOTHING;
