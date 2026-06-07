'use strict';

const CLASSES = {
  'Воин':    { emoji:'⚔️',  hp:120, atk:14, def:8,  mana:30,  color:0xE74C3C, bg:'#1a0a0a', accent:'#e74c3c' },
  'Маг':     { emoji:'🧙',  hp:80,  atk:18, def:3,  mana:100, color:0x9B59B6, bg:'#0d0a1a', accent:'#9b59b6' },
  'Лучник':  { emoji:'🏹',  hp:100, atk:16, def:5,  mana:50,  color:0x2ECC71, bg:'#0a1a0d', accent:'#2ecc71' },
  'Паладин': { emoji:'🛡️',  hp:140, atk:10, def:12, mana:60,  color:0xF1C40F, bg:'#1a1500', accent:'#f1c40f' },
};
const RACES = {
  'Человек': { emoji:'👤', bonus:'ATK+1 DEF+1',  atk:1, def:1, hp:0,  mana:0  },
  'Эльф':    { emoji:'🧝', bonus:'ATK+3 MANA+20',atk:3, def:0, hp:0,  mana:20 },
  'Орк':     { emoji:'👹', bonus:'HP+30 ATK+2',  atk:2, def:0, hp:30, mana:0  },
  'Дварф':   { emoji:'⛏️', bonus:'DEF+3 HP+20',  atk:0, def:3, hp:20, mana:0  },
};
const LOCATIONS = {
  'Лес':              { emoji:'🌲', color:'#2ecc71', bg:'#0a1a05', minLvl:1,  monsters:['Гоблин','Скелет'] },
  'Пещера':           { emoji:'🕳️', color:'#ff6f00', bg:'#1a0d00', minLvl:3,  monsters:['Тролль','Скелет','Некромант'] },
  'Замок':            { emoji:'🏰', color:'#9b59b6', bg:'#0d0019', minLvl:6,  monsters:['Некромант','Демон','Дракон'] },
  'Бездна':           { emoji:'🌑', color:'#e91e63', bg:'#0d0010', minLvl:10, monsters:['Тёмный Лорд','Хаос-Дракон','Теневой Убийца','Бездонный Ужас'] },
  'Руины Титанов':    { emoji:'⚡', color:'#f1c40f', bg:'#1a1400', minLvl:15, monsters:['Каменный Великан','Титан Земли','Древний Колосс'] },
  'Вулкан':           { emoji:'🌋', color:'#ff5722', bg:'#1a0800', minLvl:20, monsters:['Огненный Страж','Лавовый Элементаль','Огненный Дракон'] },
  'Ледяные Пики':     { emoji:'🧊', color:'#00bcd4', bg:'#001520', minLvl:25, monsters:['Снежный Йети','Ледяной Великан','Ледяной Дракон'] },
  'Пустота':          { emoji:'🌀', color:'#7c4dff', bg:'#080010', minLvl:35, monsters:['Искажённый Страж','Пожиратель Душ','Хаос-Химера'] },
  'Цитадель Теней':   { emoji:'👁️', color:'#b71c1c', bg:'#0d0000', minLvl:45, monsters:['Теневой Рыцарь','Повелитель Тьмы','Архидемон'] },
};
const MONSTERS = {
  // Лес
  'Гоблин':            { emoji:'👺', hp:30,   atk:6,   def:2,   xp:20,   gold:[5,15],    seed:'goblin-green',       accent:'#4caf50', bg:'#0a1a05', ability:'flee'     },
  'Скелет':            { emoji:'💀', hp:45,   atk:9,   def:4,   xp:35,   gold:[10,25],   seed:'skeleton-dark',      accent:'#b0bec5', bg:'#0d0d0d', ability:'armor'    },
  // Пещера
  'Тролль':            { emoji:'👹', hp:80,   atk:14,  def:7,   xp:60,   gold:[20,40],   seed:'troll-mountain',     accent:'#ff6f00', bg:'#1a0d00', ability:'regen'    },
  'Некромант':         { emoji:'🧟', hp:120,  atk:20,  def:10,  xp:100,  gold:[50,100],  seed:'necromancer-dark',   accent:'#7c4dff', bg:'#0d0019', ability:'heal'     },
  // Замок
  'Демон':             { emoji:'😈', hp:160,  atk:22,  def:12,  xp:130,  gold:[70,130],  seed:'demon-fire',         accent:'#ff1744', bg:'#1a0000', ability:'manasteal'},
  'Дракон':            { emoji:'🐉', hp:200,  atk:25,  def:15,  xp:150,  gold:[80,150],  seed:'dragon-ancient',     accent:'#f44336', bg:'#1a0000', ability:'burn'     },
  // Бездна
  'Тёмный Лорд':       { emoji:'👿', hp:350,  atk:38,  def:20,  xp:300,  gold:[150,250], seed:'dark-lord-void',     accent:'#e91e63', bg:'#0d0010', ability:'curse'    },
  'Хаос-Дракон':       { emoji:'🌑', hp:420,  atk:45,  def:22,  xp:380,  gold:[200,320], seed:'chaos-dragon-dark',  accent:'#9c27b0', bg:'#0d0010', ability:'burn'     },
  'Теневой Убийца':    { emoji:'🗡️', hp:280,  atk:50,  def:10,  xp:260,  gold:[130,220], seed:'shadow-assassin',    accent:'#607d8b', bg:'#0d0010', ability:'crit'     },
  'Бездонный Ужас':    { emoji:'👁️', hp:500,  atk:35,  def:25,  xp:450,  gold:[250,400], seed:'void-horror-eye',    accent:'#e91e63', bg:'#0d0010', ability:'heal'     },
  // Руины Титанов (15+)
  'Каменный Великан':  { emoji:'🪨', hp:400,  atk:32,  def:22,  xp:280,  gold:[130,220], seed:'stone-giant-rock',   accent:'#a1887f', bg:'#1a1400', ability:'regen'    },
  'Титан Земли':       { emoji:'⚡', hp:550,  atk:40,  def:28,  xp:380,  gold:[180,300], seed:'earth-titan-gold',   accent:'#f1c40f', bg:'#1a1400', ability:'armor'    },
  'Древний Колосс':    { emoji:'🗿', hp:750,  atk:48,  def:35,  xp:480,  gold:[250,400], seed:'ancient-colossus',   accent:'#ffd54f', bg:'#1a1400', ability:'curse'    },
  // Вулкан (20+)
  'Огненный Страж':    { emoji:'🔥', hp:480,  atk:45,  def:20,  xp:380,  gold:[200,330], seed:'fire-guard-lava',    accent:'#ff5722', bg:'#1a0800', ability:'burn'     },
  'Лавовый Элементаль':{ emoji:'🌋', hp:550,  atk:50,  def:18,  xp:440,  gold:[230,370], seed:'lava-elemental-fire',accent:'#ff7043', bg:'#1a0800', ability:'burn'     },
  'Огненный Дракон':   { emoji:'🐲', hp:700,  atk:58,  def:25,  xp:550,  gold:[300,480], seed:'fire-dragon-red',    accent:'#f44336', bg:'#1a0800', ability:'burn'     },
  // Ледяные Пики (25+)
  'Снежный Йети':      { emoji:'🦣', hp:620,  atk:50,  def:28,  xp:500,  gold:[270,430], seed:'snow-yeti-ice',      accent:'#80d8ff', bg:'#001520', ability:'freeze'   },
  'Ледяной Великан':   { emoji:'🧊', hp:800,  atk:58,  def:35,  xp:620,  gold:[350,550], seed:'ice-giant-frost',    accent:'#00bcd4', bg:'#001520', ability:'freeze'   },
  'Ледяной Дракон':    { emoji:'🐉', hp:950,  atk:65,  def:30,  xp:750,  gold:[420,650], seed:'ice-dragon-blue',    accent:'#00e5ff', bg:'#001520', ability:'freeze'   },
  // Пустота (35+)
  'Искажённый Страж':  { emoji:'🌀', hp:900,  atk:68,  def:38,  xp:800,  gold:[450,700], seed:'void-guardian-warp', accent:'#7c4dff', bg:'#080010', ability:'void'     },
  'Пожиратель Душ':    { emoji:'💜', hp:1050, atk:75,  def:35,  xp:950,  gold:[530,820], seed:'soul-eater-purple',  accent:'#9c27b0', bg:'#080010', ability:'void'     },
  'Хаос-Химера':       { emoji:'🔮', hp:1200, atk:82,  def:42,  xp:1100, gold:[650,980], seed:'chaos-chimera-void', accent:'#aa00ff', bg:'#080010', ability:'curse'    },
  // Цитадель Теней (45+)
  'Теневой Рыцарь':    { emoji:'🗡️', hp:1100, atk:85,  def:50,  xp:1000, gold:[600,900], seed:'shadow-knight-dark', accent:'#b71c1c', bg:'#0d0000', ability:'crit'     },
  'Повелитель Тьмы':   { emoji:'😱', hp:1400, atk:98,  def:58,  xp:1300, gold:[800,1200],seed:'dark-master-shadow', accent:'#d32f2f', bg:'#0d0000', ability:'curse'    },
  'Архидемон':         { emoji:'👹', hp:1800, atk:115, def:65,  xp:1600, gold:[1000,1600],seed:'archdemon-fire-dark',accent:'#ff1744', bg:'#0d0000', ability:'burn'     },
};

// Уникальные способности врагов
const ABILITIES = {
  flee:     { name:'Побег',          desc:'Сбегает при HP < 20%'               },
  armor:    { name:'Костяная броня', desc:'Блокирует 30% урона'                },
  regen:    { name:'Регенерация',    desc:'+8 HP каждый ход'                   },
  heal:     { name:'Самолечение',    desc:'Лечит 15% HP при HP < 50%'          },
  manasteal:{ name:'Кража маны',     desc:'Крадёт 10 маны за удар'             },
  burn:     { name:'Поджог',         desc:'Поджигает на 2 хода (10% HP/ход)'   },
  curse:    { name:'Проклятие',      desc:'-5 ATK на 3 хода'                   },
  crit:     { name:'Крит. удар',     desc:'20% шанс тройного урона'            },
  freeze:   { name:'Заморозка',      desc:'-8 ATK и -5 DEF на 2 хода'          },
  void:     { name:'Пустота',        desc:'Высасывает 20 маны и наносит урон'  },
};
const SHOP_ITEMS = [
  { name:'Зелье HP',     emoji:'🧪', price:30,  effect:'hp+40'   },
  { name:'Зелье маны',   emoji:'💧', price:25,  effect:'mana+40' },
  { name:'Меч +5',       emoji:'⚔️', price:100, effect:'atk+5'   },
  { name:'Щит +4',       emoji:'🛡️', price:90,  effect:'def+4'   },
  { name:'Зелье XP',     emoji:'✨', price:120, effect:'xp+100'  },
  { name:'Эликсир силы', emoji:'💪', price:200, effect:'atk+10'  },
];
const CARD_SHOP_ITEMS = [
  { name:'Бронзовая карта',          emoji:'🥉', price:500,    tierId:'bronze'  },
  { name:'Серебряная карта',         emoji:'🪙', price:1500,   tierId:'silver'  },
  { name:'Золотая карта',            emoji:'🥇', price:4000,   tierId:'gold'    },
  { name:'Алмазная карта',           emoji:'💎', price:10000,  tierId:'diamond' },
  { name:'Рубиновая карта',          emoji:'🔴', price:25000,  tierId:'ruby'    },
  { name:'Изумрудовая карта',        emoji:'💚', price:60000,  tierId:'emerald' },
  { name:'Архаловская карта',        emoji:'✨', price:150000, tierId:'arkhal'  },
];

const CARD_TIERS = [
  { id:'bronze',  name:'Бронзовая',              emoji:'🥉', limit:5000,
    grad:['#2a1000','#6d3a1a'], accent:'#cd7f32', text:'#ffe0b2',
    chip:'#b87333', pattern:'circles',  rank:1,
    perks:[], perkDesc:'Базовая карта — хранение золота' },
  { id:'silver',  name:'Серебряная',             emoji:'🪙', limit:12000,
    grad:['#151515','#4a5568'], accent:'#b0bec5', text:'#eceff1',
    chip:'#90a4ae', pattern:'lines',    rank:2,
    perks:['gold10'], perkDesc:'+10% золота с монстров' },
  { id:'gold',    name:'Золотая',                emoji:'🥇', limit:25000,
    grad:['#1a1100','#7c5800'], accent:'#ffd700', text:'#fff8e1',
    chip:'#ffc107', pattern:'stars',    rank:3,
    perks:['gold10','shop10'], perkDesc:'+10% золота · скидка 10% в магазине' },
  { id:'diamond', name:'Алмазная',               emoji:'💎', limit:50000,
    grad:['#001520','#0d3a6e'], accent:'#00e5ff', text:'#e0f7fa',
    chip:'#00bcd4', pattern:'hex',      rank:4,
    perks:['gold20','shop10'], perkDesc:'+20% золота · скидка 10% в магазине' },
  { id:'ruby',    name:'Рубиновая',              emoji:'🔴', limit:100000,
    grad:['#1a0010','#7b003a'], accent:'#f06292', text:'#fce4ec',
    chip:'#e91e63', pattern:'diamonds', rank:5,
    perks:['gold20','shop10','hp15'], perkDesc:'+20% золота · скидка 10% · +15% HP в бою' },
  { id:'emerald', name:'Изумрудовая',            emoji:'💚', limit:200000,
    grad:['#001a06','#1b5e20'], accent:'#69f0ae', text:'#e8f5e9',
    chip:'#4caf50', pattern:'waves',    rank:6,
    perks:['gold20','shop10','hp15','daily50'], perkDesc:'+20% золота · скидка 10% · +15% HP · +50% к /daily' },
  { id:'arkhal',  name:'Архаловская Магическая', emoji:'✨', limit:500000,
    grad:['#0d0019','#4a148c'], accent:'#ea80fc', text:'#f3e5f5',
    chip:'#ce93d8', pattern:'magic',    rank:7,
    perks:['gold20','shop10','hp15','daily50','title'], perkDesc:'Все привилегии + титул Архал' },
];

function getActiveTier(p) {
  if (!p.active_card) return null;
  return CARD_TIERS.find(t => t.id === p.active_card) || null;
}

function getCardBonuses(p) {
  const tier = getActiveTier(p);
  if (!tier) return { goldMult:1, shopDiscount:0, hpBonus:0, dailyMult:1, hasTitle:false };
  const perks = tier.perks || [];
  return {
    goldMult:     perks.includes('gold20') ? 1.20 : perks.includes('gold10') ? 1.10 : 1,
    shopDiscount: perks.includes('shop10') ? 0.10 : 0,
    hpBonus:      perks.includes('hp15')   ? 0.15 : 0,
    dailyMult:    perks.includes('daily50')? 1.50 : 1,
    hasTitle:     perks.includes('title'),
  };
}

function getCardTier(cardGold) {
  const g = cardGold || 0;
  for (let i = CARD_TIERS.length - 1; i >= 0; i--) {
    const prev = i === 0 ? 0 : CARD_TIERS[i-1].limit;
    if (g >= prev) return CARD_TIERS[i];
  }
  return CARD_TIERS[0];
}

const QUESTS_LIST = [
  // Лес
  { id:'q1',  chain:null, name:'Первые шаги',       desc:'Победи 1 врага',            goal:1,  xp:50,  gold:40,  next:'q2'  },
  { id:'q2',  chain:'q1', name:'Охотник новичок',    desc:'Победи 3 гоблинов',         goal:3,  xp:80,  gold:60,  next:'q3'  },
  { id:'q3',  chain:'q2', name:'Убийца гоблинов',    desc:'Победи 5 гоблинов',         goal:5,  xp:120, gold:90,  next:null  },
  // Пещера
  { id:'q4',  chain:null, name:'Истребитель нежити', desc:'Победи 2 скелетов',         goal:2,  xp:100, gold:80,  next:'q5'  },
  { id:'q5',  chain:'q4', name:'Охотник на троллей', desc:'Победи 3 троллей',          goal:3,  xp:150, gold:120, next:'q6'  },
  { id:'q6',  chain:'q5', name:'Легенда подземелья', desc:'Победи 5 врагов в Пещере',  goal:5,  xp:200, gold:160, next:null  },
  // Замок
  { id:'q7',  chain:null, name:'Поход в замок',      desc:'Победи 3 врага в Замке',    goal:3,  xp:200, gold:150, next:'q8'  },
  { id:'q8',  chain:'q7', name:'Охотник на демонов', desc:'Победи 2 демонов',          goal:2,  xp:280, gold:220, next:'q9'  },
  { id:'q9',  chain:'q8', name:'Убийца дракона',     desc:'Победи Дракона',            goal:1,  xp:400, gold:350, next:null  },
  // Бездна
  { id:'q10', chain:null, name:'Врата бездны',       desc:'Победи 3 врага в Бездне',   goal:3,  xp:500, gold:400, next:'q11' },
  { id:'q11', chain:'q10',name:'Властелин теней',    desc:'Победи Тёмного Лорда',      goal:1,  xp:700, gold:600, next:'q12' },
  { id:'q12', chain:'q11',name:'Покоритель хаоса',   desc:'Победи Хаос-Дракона',       goal:1,  xp:1000,gold:900, next:null  },
  // Случайные
  { id:'q13', chain:null, name:'Казначей',           desc:'Накопи 500 золота',         goal:500,xp:200, gold:100, next:null,  type:'gold'    },
  { id:'q14', chain:null, name:'Непобедимый',        desc:'Победи 20 врагов',           goal:20, xp:300, gold:250, next:null,  type:'kill'    },
  // Исследование
  { id:'q15', chain:null, name:'Первооткрыватель',   desc:'Исследуй локацию 3 раза',    goal:3,  xp:150, gold:120, next:'q16', type:'explore' },
  { id:'q16', chain:'q15',name:'Искатель приключений',desc:'Исследуй локацию 10 раз',   goal:10, xp:300, gold:250, next:null,  type:'explore' },
  // PvP
  { id:'q17', chain:null, name:'Дуэлянт',            desc:'Победи 3 игрока в дуэли',    goal:3,  xp:250, gold:200, next:'q18', type:'pvp'     },
  { id:'q18', chain:'q17',name:'Арена смерти',        desc:'Победи 10 игроков в дуэли',  goal:10, xp:600, gold:500, next:null,  type:'pvp'     },
  // Золото
  { id:'q19', chain:null, name:'Торговец',           desc:'Заработай 2000 золота',      goal:2000,xp:350,gold:300, next:'q20', type:'gold_earn'},
  { id:'q20', chain:'q19',name:'Богатей',            desc:'Заработай 10000 золота',     goal:10000,xp:800,gold:700,next:null,  type:'gold_earn'},
  // Убийства конкретных монстров
  { id:'q21', chain:null, name:'Охота на скелетов',  desc:'Убей 5 скелетов',            goal:5,  xp:130, gold:100, next:null,  type:'skeleton'},
  { id:'q22', chain:null, name:'Гроза троллей',      desc:'Убей 3 троллей',             goal:3,  xp:160, gold:130, next:null,  type:'troll'   },
  { id:'q23', chain:null, name:'Демонолог',          desc:'Убей 2 демонов',             goal:2,  xp:320, gold:260, next:null,  type:'demon'   },
  // Уровень
  { id:'q24', chain:null, name:'Восхождение',        desc:'Достигни 10 уровня',         goal:10, xp:400, gold:350, next:null,  type:'level'   },
  { id:'q25', chain:null, name:'Легенда',            desc:'Достигни 20 уровня',         goal:20, xp:900, gold:800, next:null,  type:'level'   },
];
const RANDOM_EVENTS = [
  { id:'treasure',  chance:25, emoji:'💰', title:'Найден клад!',         desc:'+{v} золота',   type:'gold',  val:[20,60]  },
  { id:'scroll',    chance:20, emoji:'📜', title:'Древний свиток!',      desc:'+{v} опыта',    type:'xp',    val:[30,80]  },
  { id:'spring',    chance:20, emoji:'💧', title:'Целебный источник!',   desc:'+{v} HP',        type:'hp',    val:[20,50]  },
  { id:'merchant',  chance:15, emoji:'🧙', title:'Таинственный торговец',desc:'Бесплатный предмет!',type:'item',val:[0,0] },
  { id:'curse',     chance:20, emoji:'☠️', title:'Проклятие!',           desc:'-{v} к атаке',  type:'curse', val:[3,7]    },
];
const INVENTORY_LIMIT = 20;

// ── EXPLORE события по локациям ──
const EXPLORE_EVENTS = {
  'Лес': [
    { id:'chest',    w:25, emoji:'🪙', title:'Старый сундук',       desc:'Нашёл спрятанный сундук с золотом!',       type:'gold',  val:[30,80]  },
    { id:'herb',     w:20, emoji:'🌿', title:'Целебные травы',       desc:'Собрал травы — восстановлено HP.',          type:'hp',    val:[25,50]  },
    { id:'scroll',   w:15, emoji:'📜', title:'Потерянный свиток',    desc:'Изучил свиток — получен опыт.',            type:'xp',    val:[40,90]  },
    { id:'merchant', w:15, emoji:'🧙', title:'Странствующий торговец',desc:'Торговец предлагает товар со скидкой 50%.',type:'shop',  val:[0,0]   },
    { id:'trap',     w:15, emoji:'🪤', title:'Ловушка браконьера',   desc:'Попал в ловушку — получен урон.',          type:'dmg',   val:[10,25]  },
    { id:'crystal',  w:10, emoji:'💎', title:'Магический кристалл',  desc:'Кристалл восстановил ману.',               type:'mana',  val:[30,60]  },
  ],
  'Пещера': [
    { id:'chest',    w:20, emoji:'💰', title:'Тайник разбойников',   desc:'Нашёл тайник с золотом.',                  type:'gold',  val:[60,140] },
    { id:'mushroom', w:20, emoji:'🍄', title:'Светящийся гриб',      desc:'Гриб восстановил HP.',                     type:'hp',    val:[30,60]  },
    { id:'rune',     w:15, emoji:'🔮', title:'Рунический камень',     desc:'Рунный камень дал опыт и ману.',           type:'xpmana',val:[50,30]  },
    { id:'merchant', w:15, emoji:'⛏️', title:'Торговец гномов',      desc:'Гном-торговец даёт скидку 50%.',           type:'shop',  val:[0,0]   },
    { id:'trap',     w:20, emoji:'💥', title:'Обвал камней',         desc:'Камни придавили — получен урон.',          type:'dmg',   val:[20,40]  },
    { id:'altar',    w:10, emoji:'⛩️', title:'Тёмный алтарь',        desc:'Алтарь усилил твою атаку временно.',       type:'atk_temp',val:[5,5]  },
  ],
  'Замок': [
    { id:'treasury', w:20, emoji:'👑', title:'Замковая казна',       desc:'Нашёл часть казны — много золота!',        type:'gold',  val:[100,220]},
    { id:'library',  w:15, emoji:'📚', title:'Замковая библиотека',  desc:'Прочёл редкую книгу — огромный опыт.',     type:'xp',    val:[80,150] },
    { id:'merchant', w:15, emoji:'🛡️', title:'Оружейник',            desc:'Оружейник даёт скидку 50%.',               type:'shop',  val:[0,0]   },
    { id:'ghost',    w:20, emoji:'👻', title:'Призрак рыцаря',       desc:'Призрак атаковал — получен урон.',         type:'dmg',   val:[25,50]  },
    { id:'potion',   w:20, emoji:'⚗️', title:'Алхимическая лаборатория',desc:'Нашёл зелье — восстановлено HP и мана.',type:'hpmana',val:[40,40] },
    { id:'artifact', w:10, emoji:'✨', title:'Артефакт королей',     desc:'Артефакт даёт опыт и золото!',             type:'goldxp',val:[80,100] },
  ],
  'Бездна': [
    { id:'void_gold',w:15, emoji:'🌑', title:'Осколки тьмы',        desc:'Осколки превратились в золото.',           type:'gold',  val:[150,350]},
    { id:'chaos_xp', w:15, emoji:'💫', title:'Хаотическая энергия', desc:'Энергия хаоса дала огромный опыт.',        type:'xp',    val:[120,200]},
    { id:'merchant', w:10, emoji:'😈', title:'Демон-торговец',       desc:'Демон торгует со скидкой 50%.',            type:'shop',  val:[0,0]   },
    { id:'rift',     w:25, emoji:'⚡', title:'Разлом реальности',    desc:'Разлом ударил тебя.',                      type:'dmg',   val:[35,70]  },
    { id:'soul',     w:25, emoji:'💀', title:'Потерянная душа',      desc:'Душа поглотила ману и HP.',                type:'drain', val:[30,30]  },
    { id:'throne',   w:10, emoji:'🔥', title:'Трон Бездны',          desc:'Трон дал всё: золото, опыт, HP!',          type:'all',   val:[100,80] },
  ],
  'Руины Титанов': [
    { id:'titan_gold', w:20, emoji:'⚡', title:'Золото Титанов',       desc:'Нашёл сокровища забытой эпохи.',           type:'gold',  val:[220,450]},
    { id:'ruins_xp',   w:20, emoji:'🗿', title:'Знания Великанов',     desc:'Руны великанов передали тебе мудрость.',   type:'xp',    val:[180,280]},
    { id:'quake',      w:20, emoji:'💥', title:'Землетрясение',         desc:'Обвал завалил тебя камнями.',              type:'dmg',   val:[50,100] },
    { id:'merchant',   w:12, emoji:'⛏️', title:'Гном-следопыт',         desc:'Гном-торговец даёт скидку 50%.',           type:'shop',  val:[0,0]   },
    { id:'relic',      w:18, emoji:'🏺', title:'Реликвия Титанов',      desc:'Реликвия восстановила HP и ману.',         type:'hpmana',val:[60,50] },
    { id:'power_node', w:10, emoji:'✨', title:'Узел силы',             desc:'Узел дал огромный опыт и золото!',         type:'goldxp',val:[200,150]},
  ],
  'Вулкан': [
    { id:'lava_gold',  w:18, emoji:'🌋', title:'Лавовое золото',        desc:'Магма выплеснула расплавленное золото.',   type:'gold',  val:[280,560]},
    { id:'fire_xp',    w:18, emoji:'🔥', title:'Испытание огнём',       desc:'Преодолел огонь — получен огромный опыт.', type:'xp',    val:[220,360]},
    { id:'eruption',   w:22, emoji:'💨', title:'Извержение',            desc:'Вспышка лавы обожгла тебя!',              type:'dmg',   val:[60,120] },
    { id:'merchant',   w:10, emoji:'🧙', title:'Огненный маг',          desc:'Маг продаёт зелья со скидкой 50%.',        type:'shop',  val:[0,0]   },
    { id:'fire_crystal',w:22,emoji:'💎', title:'Огненный кристалл',     desc:'Кристалл восстановил ману и HP.',          type:'hpmana',val:[70,60] },
    { id:'volcano_core',w:10,emoji:'🌟', title:'Ядро Вулкана',          desc:'Ядро дало всё: золото, опыт, HP!',         type:'all',   val:[180,150]},
  ],
  'Ледяные Пики': [
    { id:'ice_chest',  w:18, emoji:'🧊', title:'Ледяной сундук',        desc:'Нашёл замороженные сокровища.',            type:'gold',  val:[350,680]},
    { id:'frost_xp',   w:18, emoji:'❄️', title:'Ледяные руны',          desc:'Ледяные руны передали знания.',            type:'xp',    val:[280,430]},
    { id:'blizzard',   w:22, emoji:'🌨️', title:'Метель',               desc:'Буря нанесла урон и заморозила тебя.',     type:'dmg',   val:[70,140] },
    { id:'merchant',   w:10, emoji:'🦊', title:'Торговец-кочевник',      desc:'Кочевник предлагает скидку 50%.',          type:'shop',  val:[0,0]   },
    { id:'ice_spring', w:22, emoji:'💧', title:'Ледяной источник',       desc:'Источник восстановил HP и ману.',          type:'hpmana',val:[80,70] },
    { id:'frozen_relic',w:10,emoji:'✨', title:'Замороженная реликвия',  desc:'Реликвия дала золото и опыт!',             type:'goldxp',val:[300,250]},
  ],
  'Пустота': [
    { id:'void_shards', w:15, emoji:'🌀', title:'Осколки Пустоты',       desc:'Осколки реальности обернулись золотом.',  type:'gold',  val:[500,950]},
    { id:'void_xp',     w:15, emoji:'💜', title:'Поглощение разума',      desc:'Пустота передала тебе тёмные знания.',    type:'xp',    val:[380,600]},
    { id:'merchant',    w:10, emoji:'🔮', title:'Торговец-иллюзия',       desc:'Призрачный торговец даёт скидку 50%.',    type:'shop',  val:[0,0]   },
    { id:'rift_dmg',    w:25, emoji:'⚫', title:'Пространственный разрыв',desc:'Разрыв пространства нанёс урон.',         type:'dmg',   val:[90,180] },
    { id:'void_drain',  w:25, emoji:'👁️', title:'Взгляд Пустоты',         desc:'Пустота высосала HP и ману.',             type:'drain', val:[50,50]  },
    { id:'void_throne', w:10, emoji:'🌟', title:'Трон Пустоты',           desc:'Трон дал всё: золото, опыт, HP!',         type:'all',   val:[350,280]},
  ],
  'Цитадель Теней': [
    { id:'shadow_gold', w:15, emoji:'👁️', title:'Казна Теней',            desc:'Тайная казна цитадели открыта!',          type:'gold',  val:[700,1400]},
    { id:'shadow_xp',   w:15, emoji:'🗡️', title:'Элитная Тренировка',      desc:'Теневые мастера передали опыт.',          type:'xp',    val:[550,850] },
    { id:'merchant',    w:10, emoji:'😱', title:'Повелитель теней',         desc:'Лорд теней торгует со скидкой 50%.',      type:'shop',  val:[0,0]    },
    { id:'shadow_trap', w:25, emoji:'⚫', title:'Теневая ловушка',          desc:'Теневые клинки ранили тебя.',             type:'dmg',   val:[110,220] },
    { id:'dark_ritual', w:25, emoji:'💀', title:'Тёмный ритуал',            desc:'Ритуал поглотил HP и ману.',              type:'drain', val:[70,70]   },
    { id:'dark_throne', w:10, emoji:'👑', title:'Трон Теней',               desc:'Трон дал всё: золото, опыт, HP!',         type:'all',   val:[500,400] },
  ],
};

// ── ПРОФЕССИИ ──
const PROFESSIONS = {
  'Кузнец':   { emoji:'🔨', desc:'Улучшения дешевле на 30%, бонус к DEF+2 в бою',     upgradeCost:0.7, bonusDef:2,  bonusAtk:0,  goldBonus:0,   xpBonus:0  },
  'Алхимик':  { emoji:'⚗️', desc:'Зелья лечат на 50% больше, +15% к ежедневной награде',upgradeCost:1, bonusDef:0,  bonusAtk:0,  goldBonus:0,   xpBonus:0.15},
  'Охотник':  { emoji:'🏹', desc:'+15% золота с монстров, шанс найти предмет после боя',upgradeCost:1, bonusDef:0,  bonusAtk:0,  goldBonus:0.15,xpBonus:0  },
  'Маг Крови':{ emoji:'🩸', desc:'ATK+3 в бою, каждый 5-й удар высасывает HP у врага', upgradeCost:1, bonusDef:0,  bonusAtk:3,  goldBonus:0,   xpBonus:0  },
  'Следопыт': { emoji:'🗺️', desc:'+1 исследование в день, +20% к находкам в /explore', upgradeCost:1, bonusDef:0,  bonusAtk:0,  goldBonus:0,   xpBonus:0  },
};

// ── СЕЗОННЫЕ СОБЫТИЯ ──
function getSeasonalEvent() {
  const now = new Date();
  const m = now.getMonth()+1, d = now.getDate();
  if ((m===12&&d>=20)||(m===1&&d<=10)) return { name:'❄️ Зимний Фестиваль', bonus:'gold', mult:1.25, desc:'+25% золота со всех источников', color:'#00e5ff' };
  if (m>=3&&m<=5)  return { name:'🌸 Весна Возрождения', bonus:'xp',   mult:1.25, desc:'+25% опыта', color:'#69f0ae' };
  if (m>=6&&m<=8)  return { name:'☀️ Летний Поход',      bonus:'drop',  mult:1.0,  desc:'Двойной шанс найти предмет после боя', color:'#ffd700' };
  if (m>=9&&m<=11) return { name:'🍂 Осень Охотника',    bonus:'gold',  mult:1.15, desc:'+15% золота с монстров', color:'#ff6f00' };
  return null;
}

const PETS = {
  'Волк':   { icon:'wolf',   bonus:'ATK+5',         atk:5,  def:0, hp:0,  desc:'Верный волк усиливает удары',   cost:300  },
  'Феникс': { icon:'phoenix',bonus:'Воскрешение 1/бой',atk:0,def:0, hp:0,  desc:'Раз в бой воскрешает при смерти',cost:800 },
  'Дракон': { icon:'dragon', bonus:'ATK+8 DEF+3',    atk:8,  def:3, hp:0,  desc:'Мини-дракон-компаньон',         cost:1200 },
  'Фея':    { icon:'fairy',  bonus:'DEF+4 MANA+20',  atk:0,  def:4, hp:0,  desc:'Фея восстанавливает ману',      cost:500  },
  'Медведь':{ icon:'bear',   bonus:'HP+40 DEF+2',    atk:0,  def:2, hp:40, desc:'Медведь усиливает защиту',      cost:600  },
};

const ACHIEVEMENTS_LIST = [
  { id:'first_blood',   name:'Первая кровь',      desc:'Одержи первую победу',        icon:'⚔️',  gold:100,  check: p => p.wins >= 1       },
  { id:'fighter10',     name:'Опытный боец',       desc:'Одержи 10 побед',             icon:'🗡️',  gold:200,  check: p => p.wins >= 10      },
  { id:'veteran',       name:'Ветеран',            desc:'Одержи 50 побед',             icon:'🏅',  gold:400,  check: p => p.wins >= 50      },
  { id:'legend',        name:'Легенда',            desc:'Одержи 100 побед',            icon:'👑',  gold:800,  check: p => p.wins >= 100     },
  { id:'lvl5',          name:'Крутой парень',      desc:'Достигни 5 уровня',           icon:'⭐',  gold:150,  check: p => p.level >= 5      },
  { id:'lvl10',         name:'Герой',              desc:'Достигни 10 уровня',          icon:'🌟',  gold:300,  check: p => p.level >= 10     },
  { id:'lvl20',         name:'Полубог',            desc:'Достигни 20 уровня',          icon:'💫',  gold:600,  check: p => p.level >= 20     },
  { id:'gold500',       name:'Богач',              desc:'Накопи 500 золота',           icon:'💰',  gold:200,  check: p => p.gold >= 500     },
  { id:'gold1000',      name:'Миллионер',          desc:'Накопи 1000 золота',          icon:'💎',  gold:400,  check: p => p.gold >= 1000    },
  { id:'goblin10',      name:'Гроза гоблинов',     desc:'Убей 10 гоблинов',            icon:'👺',  gold:250,  check: p => (p.kills_goblin||0) >= 10  },
  { id:'dragon1',       name:'Убийца дракона',     desc:'Убей дракона',                icon:'🐉',  gold:500,  check: p => (p.kills_dragon||0) >= 1   },
  { id:'pvp1',          name:'Дуэлянт',            desc:'Выиграй PvP дуэль',           icon:'🤺',  gold:200,  check: p => (p.pvp_wins||0) >= 1  },
  { id:'pvp5',          name:'Гладиатор',          desc:'Выиграй 5 PvP дуэлей',        icon:'🛡️',  gold:500,  check: p => (p.pvp_wins||0) >= 5  },
  { id:'casino1',       name:'Удача в казино',     desc:'Выиграй в казино',            icon:'🎰',  gold:150,  check: p => (p.casino_wins||0) >= 1 },
  { id:'casino5',       name:'Казино-мастер',      desc:'Выиграй 5 раз в казино',      icon:'🃏',  gold:300,  check: p => (p.casino_wins||0) >= 5 },
  { id:'quest5',        name:'Квестомастер',       desc:'Выполни 5 квестов',           icon:'📜',  gold:350,  check: p => (p.quests_done||0) >= 5  },
  { id:'allLoc',        name:'Путешественник',     desc:'Побеждай в каждой локации',   icon:'🗺️',  gold:400,  check: p => (p.kills_total||0) >= 15 },
  { id:'survive',       name:'Выживший',           desc:'Выживи с HP < 10',            icon:'💀',  gold:300,  check: p => false },
  { id:'rich_kill',     name:'Мародёр',            desc:'Получи 130+ золота с боя',    icon:'💸',  gold:250,  check: p => false },
  { id:'collector',     name:'Коллекционер',       desc:'Имей 5 предметов в инвентаре',icon:'🎒',  gold:200,  check: p => false },
];
const ALL_ACHIEVEMENTS_BONUS = { gold: 3000, title: '🏆 Мастер Феникса' };

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const XP_PER_LEVEL = lvl => lvl * 100;

module.exports = {
  CLASSES, RACES, LOCATIONS, MONSTERS, ABILITIES,
  SHOP_ITEMS, CARD_SHOP_ITEMS, QUESTS_LIST, RANDOM_EVENTS, EXPLORE_EVENTS,
  PROFESSIONS, PETS, ACHIEVEMENTS_LIST, ALL_ACHIEVEMENTS_BONUS, CARD_TIERS,
  INVENTORY_LIMIT, rand, XP_PER_LEVEL,
  getActiveTier, getCardBonuses, getCardTier, getSeasonalEvent,
};
