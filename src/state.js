'use strict';

const battles = new Map();            // playerId → { monster, turn, startedAt }
const pvpBattles = new Map();         // challengerId → { p2id, turn, cur }
const pendingDuels = new Map();       // targetId → challengerId
const pendingTrades = new Map();      // targetId → { fromId, cardName }
const fightCooldowns = new Map();     // playerId → timestamp последнего боя
const processingInteractions = new Set(); // защита от двойного нажатия кнопок

const FIGHT_COOLDOWN_MS = 20_000; // 20 секунд между боями

// Чистка зависших боёв старше 10 минут
setInterval(() => {
  const now = Date.now();
  for (const [id, b] of battles) {
    if (now - (b.startedAt || 0) > 10 * 60 * 1000) battles.delete(id);
  }
}, 60_000);

// Кэш аватаров
const avatarCache = new Map(); // seed → { img, ts }
const AVATAR_TTL = 10 * 60 * 1000;

// Чистка устаревших аватаров каждые 15 минут
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of avatarCache) {
    if (now - v.ts > AVATAR_TTL) avatarCache.delete(k);
  }
}, 15 * 60 * 1000);

module.exports = {
  battles,
  pvpBattles,
  pendingDuels,
  pendingTrades,
  fightCooldowns,
  processingInteractions,
  FIGHT_COOLDOWN_MS,
  avatarCache,
  AVATAR_TTL,
};
