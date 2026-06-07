'use strict';
const db = require('./database');
const { ACHIEVEMENTS_LIST, ALL_ACHIEVEMENTS_BONUS, INVENTORY_LIMIT, XP_PER_LEVEL } = require('../data/constants');

const stmt = {
  getPlayer:       db.prepare('SELECT * FROM players WHERE id=?'),
  insertPlayer:    db.prepare('INSERT INTO players (id,name) VALUES (?,?)'),
  savePlayer:      db.prepare(`UPDATE players SET level=?,xp=?,hp=?,max_hp=?,attack=?,defense=?,mana=?,max_mana=?,gold=?,wins=?,losses=?,class=?,last_daily=?,race=?,title=?,location=?,kills_goblin=?,kills_skeleton=?,kills_troll=?,kills_dragon=?,kills_total=?,pvp_wins=?,casino_wins=?,quests_done=?,gold_earned=?,card_gold=?,active_card=?,free_rest_until=?,pet=?,guild_id=?,profession=?,explore_used_today=?,explore_date=? WHERE id=?`),
  getInventory:    db.prepare('SELECT * FROM inventory WHERE player_id=?'),
  invTotal:        db.prepare('SELECT SUM(qty) as t FROM inventory WHERE player_id=?'),
  invItem:         db.prepare('SELECT * FROM inventory WHERE player_id=? AND item=?'),
  invAdd:          db.prepare('UPDATE inventory SET qty=qty+1 WHERE player_id=? AND item=?'),
  invInsert:       db.prepare('INSERT INTO inventory (player_id,item,qty) VALUES (?,?,1)'),
  invDec:          db.prepare('UPDATE inventory SET qty=qty-1 WHERE player_id=? AND item=?'),
  invDel:          db.prepare('DELETE FROM inventory WHERE player_id=? AND item=?'),
  weekGet:         db.prepare('SELECT * FROM weekly_stats WHERE player_id=?'),
  weekInsert:      db.prepare('INSERT INTO weekly_stats (player_id,wins,gold,week) VALUES (?,1,?,?)'),
  weekReset:       db.prepare('UPDATE weekly_stats SET wins=1,gold=?,week=? WHERE player_id=?'),
  weekAdd:         db.prepare('UPDATE weekly_stats SET wins=wins+1,gold=gold+? WHERE player_id=?'),
  achGet:          db.prepare('SELECT name FROM achievements WHERE player_id=?'),
  achInsert:       db.prepare('INSERT INTO achievements (player_id,name) VALUES (?,?)'),
};

function getPlayer(id, name) {
  let p = stmt.getPlayer.get(id);
  if (!p) { stmt.insertPlayer.run(id, name); p = stmt.getPlayer.get(id); }
  return p;
}

function savePlayer(p) {
  stmt.savePlayer.run(
    p.level, p.xp, p.hp, p.max_hp, p.attack, p.defense, p.mana, p.max_mana, p.gold, p.wins, p.losses, p.class, p.last_daily,
    p.race||'Человек', p.title||'', p.location||'Лес',
    p.kills_goblin||0, p.kills_skeleton||0, p.kills_troll||0, p.kills_dragon||0, p.kills_total||0,
    p.pvp_wins||0, p.casino_wins||0, p.quests_done||0, p.gold_earned||0,
    p.card_gold||0, p.active_card||'', p.free_rest_until||0,
    p.pet||'', p.guild_id||'', p.profession||'', p.explore_used_today||0, p.explore_date||'',
    p.id
  );
}

function checkLevelUp(p) {
  const msgs = [];
  while (p.xp >= XP_PER_LEVEL(p.level)) {
    p.xp -= XP_PER_LEVEL(p.level); p.level++;
    p.max_hp += 15; p.hp = p.max_hp; p.attack += 2; p.defense += 1; p.max_mana += 10; p.mana = p.max_mana;
    msgs.push(`🎉 Уровень ${p.level}! HP+15 ATK+2 DEF+1`);
  }
  return msgs;
}

function getInventory(id) { return stmt.getInventory.all(id); }

function addItem(id, item) {
  const total = stmt.invTotal.get(id)?.t || 0;
  if (total >= INVENTORY_LIMIT) return false;
  const e = stmt.invItem.get(id, item);
  if (e) stmt.invAdd.run(id, item);
  else stmt.invInsert.run(id, item);
  return true;
}

function removeItem(id, item) {
  const r = stmt.invItem.get(id, item);
  if (!r || r.qty < 1) return false;
  if (r.qty === 1) stmt.invDel.run(id, item);
  else stmt.invDec.run(id, item);
  return true;
}

function useItem(id, item) {
  return removeItem(id, item);
}

// Недельный рейтинг
function getWeek() {
  const d = new Date();
  return `${d.getFullYear()}-W${Math.ceil((d - new Date(d.getFullYear(), 0, 1)) / 604800000)}`;
}

function addWeeklyWin(playerId, goldGain) {
  const week = getWeek();
  const row = stmt.weekGet.get(playerId);
  if (!row) stmt.weekInsert.run(playerId, goldGain, week);
  else if (row.week !== week) stmt.weekReset.run(goldGain, week, playerId);
  else stmt.weekAdd.run(goldGain, playerId);
}

function checkAchievements(p) {
  const unlocked = new Set(stmt.achGet.all(p.id).map(r => r.name));
  const newOnes = [];
  let goldEarned = 0;
  for (const a of ACHIEVEMENTS_LIST) {
    if (!unlocked.has(a.id) && a.check(p)) {
      try {
        stmt.achInsert.run(p.id, a.id);
        newOnes.push(a);
        goldEarned += a.gold || 0;
        unlocked.add(a.id);
      } catch {}
    }
  }
  // Бонус за все 20 достижений
  let allDone = false;
  if (newOnes.length > 0 && unlocked.size >= ACHIEVEMENTS_LIST.length) {
    const bonusId = 'all_achievements';
    const alreadyGot = stmt.achGet.all(p.id).some(r => r.name === bonusId);
    if (!alreadyGot) {
      try { stmt.achInsert.run(p.id, bonusId); } catch {}
      goldEarned += ALL_ACHIEVEMENTS_BONUS.gold;
      allDone = true;
    }
  }
  if (goldEarned > 0) {
    p.gold = (p.gold || 0) + goldEarned;
    p.gold_earned = (p.gold_earned || 0) + goldEarned;
  }
  return { newOnes, goldEarned, allDone };
}

function unlockAchievement(playerId, id) {
  const a = ACHIEVEMENTS_LIST.find(x => x.id === id); if (!a) return null;
  try { stmt.achInsert.run(playerId, id); return a; } catch { return null; }
}

function getUpgradeLevel(playerId, itemName) {
  const row = db.prepare('SELECT level FROM gear_upgrades WHERE player_id=? AND item=?').get(playerId, itemName);
  return row ? row.level : 0;
}

function setUpgradeLevel(playerId, itemName, level) {
  db.prepare('INSERT INTO gear_upgrades (player_id,item,level) VALUES (?,?,?) ON CONFLICT(player_id,item) DO UPDATE SET level=?').run(playerId, itemName, level, level);
}

module.exports = {
  stmt,
  db,
  getPlayer, savePlayer, checkLevelUp, getInventory, addItem, removeItem, useItem,
  addWeeklyWin, getWeek,
  checkAchievements, unlockAchievement,
  getUpgradeLevel, setUpgradeLevel,
};
