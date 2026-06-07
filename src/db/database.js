'use strict';
const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH || '/var/www/rpg-bot/rpg.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, name TEXT, class TEXT DEFAULT 'Воин',
    race TEXT DEFAULT 'Человек', title TEXT DEFAULT '',
    level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0,
    hp INTEGER DEFAULT 100, max_hp INTEGER DEFAULT 100,
    attack INTEGER DEFAULT 10, defense INTEGER DEFAULT 5,
    mana INTEGER DEFAULT 50, max_mana INTEGER DEFAULT 50,
    gold INTEGER DEFAULT 50, wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0, last_daily TEXT DEFAULT '',
    location TEXT DEFAULT 'Лес', kills_goblin INTEGER DEFAULT 0,
    kills_skeleton INTEGER DEFAULT 0, kills_troll INTEGER DEFAULT 0,
    kills_dragon INTEGER DEFAULT 0, kills_total INTEGER DEFAULT 0,
    pvp_wins INTEGER DEFAULT 0, casino_wins INTEGER DEFAULT 0,
    quests_done INTEGER DEFAULT 0, gold_earned INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT, item TEXT, qty INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS quests (
    player_id TEXT PRIMARY KEY, quest TEXT,
    progress INTEGER DEFAULT 0, goal INTEGER DEFAULT 0,
    reward_xp INTEGER DEFAULT 0, reward_gold INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT, name TEXT,
    UNIQUE(player_id, name)
  );
  CREATE TABLE IF NOT EXISTS duels (
    id TEXT PRIMARY KEY, challenger_id TEXT, target_id TEXT,
    status TEXT DEFAULT 'pending', msg_id TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS guilds (
    id TEXT PRIMARY KEY, name TEXT UNIQUE, leader_id TEXT,
    treasury INTEGER DEFAULT 0, description TEXT DEFAULT '',
    created_at TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS weekly_stats (
    player_id TEXT PRIMARY KEY, wins INTEGER DEFAULT 0,
    gold INTEGER DEFAULT 0, week TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS market (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id TEXT, seller_name TEXT,
    item TEXT, item_type TEXT,
    price INTEGER, listed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_players_level ON players(level DESC);
  CREATE INDEX IF NOT EXISTS idx_inventory_player ON inventory(player_id);
  CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);
  CREATE INDEX IF NOT EXISTS idx_quests_player ON quests(player_id);
`);

const COLS = ['race','title','location','kills_goblin','kills_skeleton','kills_troll',
  'kills_dragon','kills_total','pvp_wins','casino_wins','quests_done','gold_earned',
  'pet','guild_id','burn_turns','debuff_atk','debuff_turns','active_card'];
for (const c of COLS) {
  const isInt = c.startsWith('kills')||c.endsWith('wins')||c.endsWith('done')||c.endsWith('earned')||c.endsWith('turns')||c.endsWith('atk');
  try { db.exec(`ALTER TABLE players ADD COLUMN ${c} ${isInt?'INTEGER DEFAULT 0':'TEXT DEFAULT \'\''}`) } catch {}
}
try { db.exec(`ALTER TABLE players ADD COLUMN location TEXT DEFAULT 'Лес'`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN card_gold INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN free_rest_until INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN profession TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN explore_used_today INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE players ADD COLUMN explore_date TEXT DEFAULT ''`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS gear_upgrades (player_id TEXT, item TEXT, level INTEGER DEFAULT 1, PRIMARY KEY(player_id,item))`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS player_snapshots (
  player_id TEXT, snapshot_date TEXT,
  name TEXT, level INTEGER, attack INTEGER, defense INTEGER,
  max_hp INTEGER, gold INTEGER, card_gold INTEGER, wins INTEGER, losses INTEGER,
  PRIMARY KEY(player_id, snapshot_date)
)`); } catch {}

module.exports = db;
