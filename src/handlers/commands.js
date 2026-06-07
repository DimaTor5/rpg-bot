'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const {
  CLASSES, RACES, LOCATIONS, MONSTERS, QUESTS_LIST, RANDOM_EVENTS,
  SHOP_ITEMS, CARD_SHOP_ITEMS, CARD_TIERS, PROFESSIONS, PETS, ACHIEVEMENTS_LIST,
  INVENTORY_LIMIT, rand, XP_PER_LEVEL,
  getActiveTier, getCardBonuses, getCardTier, getSeasonalEvent,
} = require('../data/constants');
const {
  db, getPlayer, savePlayer, checkLevelUp, getInventory, addItem, removeItem, useItem,
  addWeeklyWin, getWeek, checkAchievements, unlockAchievement,
  getUpgradeLevel, setUpgradeLevel,
} = require('../db/queries');
const {
  generateBankCard, generateProfileCard, generateBattleCard, generateResultCard,
  generateShopCard, generateFleeCard, generateRestCard, generateDailyCard,
  generateQuestCard, generateInventoryCard, generateTopCard, generateAchievementsCard,
  generateLocationCard, generateCasinoCard, generateHelpCard, generateMarketCard,
  generateExploreCard, generateUpgradeCard, generateProfessionCard, generateStatsCard,
  generatePetShopCard, generatePetCard, generateGuildCard,
} = require('../canvas/generators');
const { battles, pvpBattles, pendingDuels, pendingTrades, fightCooldowns, FIGHT_COOLDOWN_MS } = require('../state');

// Личные команды — только отправителю
const EPHEMERAL_CMDS = new Set([
  'profile','inventory','stats','shop','rest','daily','quest',
  'help','achievements','location','pet','use','customize','gamble','weekly','market','explore','upgrade','profession'
]);

// Автоудаление публичных ответов через 3 минуты
async function autoDelete(interaction, delayMs=180_000) {
  setTimeout(async () => {
    try { await interaction.deleteReply(); } catch {}
  }, delayMs);
}

const divider = '─'.repeat(28);

function battleEmbed(p, battle, log=[]) {
  const m = battle.monster, cls = CLASSES[p.class] || CLASSES['Воин'];
  return new EmbedBuilder()
    .setColor(m.curHp/m.hp<0.3?0x2ECC71:0xE74C3C)
    .setTitle(`⚔️  Бой · Ход ${battle.turn||1}`)
    .setDescription(
      `**${m.emoji} ${m.name}**  HP: \`${m.curHp}/${m.hp}\`\n`+
      `**${cls.emoji} ${p.name}**  HP: \`${p.hp}/${p.max_hp}\`  💙\`${p.mana}/${p.max_mana}\`\n`+
      `\`${divider}\`\n`+
      (log.length?log.map(l=>`> ${l}`).join('\n'):'> 🎲 Выбери действие!')
    )
    .setFooter({text:`⚔️${p.attack} 🛡️${p.defense} 💰${p.gold}🪙`}).setTimestamp();
}

async function handleCmd(interaction) {
  const { commandName, user } = interaction;
  const p = getPlayer(user.id, user.username);
  const isEphemeral = EPHEMERAL_CMDS.has(commandName);

  // ── /start ──
  if (commandName==='start') {
    const cls=interaction.options.getString('класс'), c=CLASSES[cls];
    Object.assign(p,{class:cls,max_hp:c.hp,hp:c.hp,attack:c.atk,defense:c.def,max_mana:c.mana,mana:c.mana,xp:0,level:1,gold:50});
    savePlayer(p);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateProfileCard(p), att=new AttachmentBuilder(buf,{name:'profile.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(c.color).setTitle(`${c.emoji}  Добро пожаловать, ${cls}!`).setDescription(`**${user.username}**, приключение начинается!\n\nИспользуй **/fight** чтобы сразиться или **/location** чтобы выбрать локацию.`).setImage('attachment://profile.png').setTimestamp()],files:[att]});
    } catch { return interaction.editReply({content:`${c.emoji} Персонаж **${cls}** создан! Используй /fight!`}); }
  }

  // ── /profile ──
  if (commandName==='profile') {
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateProfileCard(p), att=new AttachmentBuilder(buf,{name:'profile.png'});
      const xpN=XP_PER_LEVEL(p.level), wr=p.wins+p.losses>0?Math.round(p.wins/(p.wins+p.losses)*100):0;
      const cls=CLASSES[p.class]||CLASSES['Воин'];
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(cls.color).setTitle(`${cls.emoji}  ${p.name} · ${p.class} · Ур.${p.level}`).addFields({name:'📍 Локация',value:`${LOCATIONS[p.location||'Лес']?.emoji||'🌲'} ${p.location||'Лес'}`,inline:true},{name:'🏆 Побед',value:`\`${p.wins}\``,inline:true},{name:'📊 Винрейт',value:`\`${wr}%\``,inline:true}).setImage('attachment://profile.png').setFooter({text:'/fight · /shop · /quest · /achievements'}).setTimestamp()],files:[att]});
    } catch { return interaction.reply({embeds:[new EmbedBuilder().setColor(0x7289DA).setTitle(p.name).setDescription(`Уровень ${p.level} · ${p.class}`).setTimestamp()]}); }
  }

  // ── /fight ──
  if (commandName==='fight') {
    if (p.hp<=0) return interaction.reply({content:'💀 Используй **/rest** для восстановления.',ephemeral:true});
    if (battles.has(user.id)) return interaction.reply({content:'⚔️ Ты уже в бою!',ephemeral:true});
    // Кулдаун 20 секунд
    const lastFight = fightCooldowns.get(user.id)||0;
    const remaining = Math.ceil((FIGHT_COOLDOWN_MS - (Date.now()-lastFight))/1000);
    if (remaining > 0) return interaction.reply({content:`⏳ Подожди ещё **${remaining} сек.** перед следующим боем.`,ephemeral:true});
    fightCooldowns.set(user.id, Date.now());

    const loc=LOCATIONS[p.location||'Лес']||LOCATIONS['Лес'];
    const mNames=loc.monsters;
    const mName=mNames[rand(0,mNames.length-1)];
    const mDef=MONSTERS[mName];

    // Масштабирование врага под уровень игрока
    const scale = 1 + (p.level - 1) * 0.15;
    // Элитный враг — 20% шанс
    const isElite = rand(1,100) <= 20;
    const eScale = isElite ? scale * 1.5 : scale;
    const monster={
      ...mDef,
      name:   (isElite ? 'Элитный ' : '') + mName,
      hp:     Math.round(mDef.hp  * eScale),
      atk:    Math.round(mDef.atk * eScale),
      def:    Math.round(mDef.def * eScale),
      gold:   [Math.round(mDef.gold[0]*eScale), Math.round(mDef.gold[1]*eScale)],
      xp:     Math.round(mDef.xp  * eScale),
      curHp:  Math.round(mDef.hp  * eScale),
      isElite,
      ability: mDef.ability,
      healedOnce: false,
      burnApplied: false,
    };
    // Бонус HP от Рубиновой+ карты
    const cardBonuses=getCardBonuses(p);
    if (cardBonuses.hpBonus>0) {
      const extraHp=Math.floor(p.max_hp*cardBonuses.hpBonus);
      p.hp=Math.min(p.hp+extraHp, Math.floor(p.max_hp*(1+cardBonuses.hpBonus)));
    }
    battles.set(user.id,{monster,turn:1,startedAt:Date.now(),burnTurns:0,burnDmg:0,debuffAtk:0,debuffTurns:0,freezeTurns:0,freezeAtkDebuff:0,freezeDefDebuff:0});
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    const fightRow=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fight_attack').setLabel('Атака').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('fight_magic').setLabel('Магия').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('fight_inventory').setLabel('Инвентарь').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('fight_flee').setLabel('Бежать').setStyle(ButtonStyle.Secondary),
    );
    try {
      const buf=await generateBattleCard(p,battles.get(user.id)), att=new AttachmentBuilder(buf,{name:'battle.png'});
      await interaction.editReply({embeds:[battleEmbed(p,battles.get(user.id)).setImage('attachment://battle.png')],files:[att],components:[fightRow]});
    } catch { await interaction.editReply({embeds:[battleEmbed(p,battles.get(user.id))],components:[fightRow]}); }
    autoDelete(interaction, 5*60*1000);
  }

  // ── /inventory ──
  if (commandName==='inventory') {
    const items=getInventory(user.id);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateInventoryCard(items,p), att=new AttachmentBuilder(buf,{name:'inv.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x8E44AD).setTitle(`🎒 Инвентарь`).setImage('attachment://inv.png').setFooter({text:'/use <предмет>'}).setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:items.length?items.map(i=>`**${i.item}** ×${i.qty}`).join('\n'):'Пусто!'}); }
  }

  // ── /shop ──
  if (commandName==='shop') {
    const bonuses = getCardBonuses(p);
    const disc = bonuses.shopDiscount;
    const makeGearBtn = i => {
      const fp = Math.floor(i.price*(1-disc));
      return new ButtonBuilder()
        .setCustomId(`buy_${i.name}`)
        .setLabel(`${i.emoji} ${i.name} ${fp}🪙${disc>0?' ✂️':''}`)
        .setStyle(ButtonStyle.Primary);
    };
    const makeCardBtn = c => new ButtonBuilder()
      .setCustomId(`buycard_${c.tierId}`)
      .setLabel(`${c.emoji} ${c.name} ${c.price>=1000?Math.round(c.price/1000)+'k':c.price}🪙`)
      .setStyle(ButtonStyle.Success);
    const rowGear1=new ActionRowBuilder().addComponents(SHOP_ITEMS.slice(0,4).map(makeGearBtn));
    const rowGear2=new ActionRowBuilder().addComponents(SHOP_ITEMS.slice(4).map(makeGearBtn));
    const rowCard1=new ActionRowBuilder().addComponents(CARD_SHOP_ITEMS.slice(0,4).map(makeCardBtn));
    const rowCard2=new ActionRowBuilder().addComponents(CARD_SHOP_ITEMS.slice(4).map(makeCardBtn));
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateShopCard(p.gold, disc), att=new AttachmentBuilder(buf,{name:'shop.png'});
      return interaction.editReply({
        embeds:[new EmbedBuilder().setColor(0xF39C12).setTitle('🏪 Магазин').setImage('attachment://shop.png').setFooter({text:'⚔️ Снаряжение сверху · 💳 Карты снизу · /use <название> чтобы экипировать'}).setTimestamp()],
        files:[att],
        components:[rowGear1,rowGear2,rowCard1,rowCard2]
      });
    } catch { return interaction.editReply({content:'Магазин временно недоступен.'}); }
  }

  // ── /quest ──
  if (commandName==='quest') {
    let q=db.prepare('SELECT * FROM quests WHERE player_id=?').get(user.id);
    if (!q) {
      const qDef=QUESTS_LIST[rand(0,QUESTS_LIST.length-1)];
      db.prepare('INSERT INTO quests (player_id,quest,progress,goal,reward_xp,reward_gold) VALUES (?,?,0,?,?,?)').run(user.id,qDef.name,qDef.goal,qDef.xp,qDef.gold);
      q=db.prepare('SELECT * FROM quests WHERE player_id=?').get(user.id);
    }
    const quest=QUESTS_LIST.find(x=>x.name===q.quest)||QUESTS_LIST[0];
    const done=q.progress>=q.goal;
    if (done) {
      p.xp+=q.reward_xp; p.gold+=q.reward_gold; p.quests_done=(p.quests_done||0)+1;
      checkLevelUp(p); savePlayer(p);
      db.prepare('DELETE FROM quests WHERE player_id=?').run(user.id);
      const newA=checkAchievements(p);
      if (newA.length) {
        for (const a of newA) try { db.prepare('INSERT INTO achievements (player_id,name) VALUES (?,?)').run(user.id,a.id); } catch {}
      }
    }
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateQuestCard(q,quest,done), att=new AttachmentBuilder(buf,{name:'quest.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(done?0xF1C40F:0x1ABC9C).setTitle(done?'✅ Квест выполнен!':'📜 Активный квест').setImage('attachment://quest.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:done?`✅ Квест **${q.quest}** выполнен! +${q.reward_xp}XP +${q.reward_gold}🪙`:`📜 **${q.quest}** — ${q.progress}/${q.goal}`}); }
  }

  // ── /daily ──
  if (commandName==='daily') {
    const today=new Date().toDateString();
    if (p.last_daily===today) return interaction.reply({content:'⏰ Уже получил сегодня. Приходи завтра!',ephemeral:true});
    const bonuses=getCardBonuses(p);
    const season=getSeasonalEvent();
    const profD=PROFESSIONS[p.profession||'']||null;
    const baseGold=rand(30,80), baseXp=rand(20,50);
    let dailyMult=bonuses.dailyMult;
    if(profD?.xpBonus) dailyMult=Math.max(dailyMult,1+profD.xpBonus);
    if(season?.bonus==='gold') dailyMult*=season.mult;
    const gold=Math.floor(baseGold*dailyMult), xp=Math.floor(baseXp*(season?.bonus==='xp'?season.mult:1));
    p.gold+=gold; p.xp+=xp; p.last_daily=today; p.gold_earned=(p.gold_earned||0)+gold;
    const lvl=checkLevelUp(p); savePlayer(p);
    const newA=checkAchievements(p);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateDailyCard(p,gold,xp,lvl[0]||null), att=new AttachmentBuilder(buf,{name:'daily.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0xF1C40F).setTitle('🎁 Ежедневная награда!').setImage('attachment://daily.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:`🎁 +${gold}🪙 +${xp}XP!`}); }
  }

  // ── /top ──
  if (commandName==='top') {
    const players=db.prepare('SELECT name,level,wins,losses,class,gold FROM players ORDER BY level DESC, wins DESC LIMIT 8').all();
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateTopCard(players), att=new AttachmentBuilder(buf,{name:'top.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0xE67E22).setTitle('🏆 Таблица Лидеров').setImage('attachment://top.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:players.map((r,i)=>`**${i+1}.** ${r.name} Ур.${r.level} (${r.wins}⚔️)`).join('\n')}); }
  }

  // ── /rest ──
  if (commandName==='rest') {
    if (battles.has(user.id)) return interaction.reply({content:'⚔️ Нельзя отдыхать во время боя!',ephemeral:true});
    if (p.hp===p.max_hp&&p.mana===p.max_mana) return interaction.reply({content:'😴 Уже полностью восстановлен!',ephemeral:true});

    const now = Date.now();
    if ((p.free_rest_until||0) > 0) {
      if (now >= p.free_rest_until) {
        p.hp=p.max_hp; p.mana=p.max_mana; p.free_rest_until=0; savePlayer(p);
        await interaction.deferReply({ ephemeral: isEphemeral??false });
        try { const buf=await generateRestCard(p,0,'wait'), att=new AttachmentBuilder(buf,{name:'rest.png'}); return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x27AE60).setTitle('🏠 Таверна').setImage('attachment://rest.png').setTimestamp()],files:[att]}); }
        catch { return interaction.editReply({content:`✅ Выспался и восстановился бесплатно!`}); }
      } else {
        const secsLeft = Math.ceil((p.free_rest_until - now) / 1000);
        const minsLeft = Math.floor(secsLeft / 60), sLeft = secsLeft % 60;
        const timeStr = minsLeft > 0 ? `${minsLeft} мин ${sLeft} сек` : `${sLeft} сек`;
        return interaction.reply({content:`😴 Ты отдыхаешь... Осталось ждать: **${timeStr}**\nЗатем используй \`/rest\` снова.`,ephemeral:true});
      }
    }

    const restCost = p.level * 20;
    const canWallet = p.gold >= restCost;
    const canCard   = (p.card_gold||0) >= restCost && !!p.active_card;
    const hpPct = p.hp / p.max_hp;
    const waitMins = hpPct > 0.75 ? 2 : hpPct > 0.5 ? 5 : hpPct > 0.25 ? 7 : 10;
    const btns = [];
    if (canWallet) btns.push(new ButtonBuilder().setCustomId(`rest_wallet_${restCost}`).setLabel(`👛 Кошелёк — ${restCost}🪙`).setStyle(ButtonStyle.Primary));
    if (canCard)   btns.push(new ButtonBuilder().setCustomId(`rest_card_${restCost}`).setLabel(`💳 Карта — ${restCost}🪙`).setStyle(ButtonStyle.Success));
    btns.push(new ButtonBuilder().setCustomId(`rest_wait_${waitMins}`).setLabel(`😴 Переждать ${waitMins} мин`).setStyle(ButtonStyle.Secondary));
    const row = new ActionRowBuilder().addComponents(btns);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    const noMoneyNote = !canWallet && !canCard ? `\n💸 Не хватает **${restCost}🪙** для платного отдыха.` : '';
    try {
      const hasTier = !!p.active_card;
      const buf = hasTier ? await generateBankCard(p) : null;
      const tier = getActiveTier(p);
      const embed = new EmbedBuilder()
        .setColor(tier ? parseInt(tier.accent.replace('#',''),16) : 0x27AE60)
        .setTitle('🏠 Таверна — Выбери оплату')
        .setDescription(`Стоимость отдыха: **${restCost}🪙** (уровень ${p.level})${noMoneyNote}\n\nОткуда списать?`)
        .setTimestamp();
      if (buf) {
        const att = new AttachmentBuilder(buf, {name:'card.png'});
        embed.setImage('attachment://card.png');
        return interaction.editReply({embeds:[embed], files:[att], components:[row]});
      }
      return interaction.editReply({embeds:[embed], components:[row]});
    } catch {
      return interaction.editReply({
        embeds:[new EmbedBuilder().setColor(0x27AE60).setTitle('🏠 Таверна — Выбери оплату')
          .setDescription(`Стоимость отдыха: **${restCost}🪙** (уровень ${p.level})${noMoneyNote}\n\nОткуда списать?\n👛 Кошелёк: \`${p.gold}🪙\` · 💳 Карта: \`${p.card_gold||0}🪙\``)
          .setTimestamp()],
        components:[row]
      });
    }
  }

  // ── /achievements ──
  if (commandName==='achievements') {
    const unlocked=db.prepare('SELECT name FROM achievements WHERE player_id=?').all(user.id).map(r=>r.name);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateAchievementsCard(p,unlocked), att=new AttachmentBuilder(buf,{name:'ach.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0xF1C40F).setTitle(`🏆 Достижения · ${unlocked.length}/${ACHIEVEMENTS_LIST.length}`).setImage('attachment://ach.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:`Достижений: ${unlocked.length}/${ACHIEVEMENTS_LIST.length}`}); }
  }

  // ── /location ──
  if (commandName==='location') {
    const locName=interaction.options.getString('место'), loc=LOCATIONS[locName];
    if (!loc) return interaction.reply({content:'❌ Локация не найдена.',ephemeral:true});
    if (p.level<loc.minLvl) return interaction.reply({content:`❌ Нужен уровень **${loc.minLvl}**! У тебя ${p.level}.`,ephemeral:true});
    p.location=locName; savePlayer(p);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateLocationCard(loc,locName,p), att=new AttachmentBuilder(buf,{name:'loc.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(parseInt(loc.color.replace('#',''),16)).setTitle(`${loc.emoji} ${locName}`).setImage('attachment://loc.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:`${loc.emoji} Ты теперь в **${locName}**!`}); }
  }

  // ── /duel ──
  if (commandName==='duel') {
    const target=interaction.options.getUser('игрок');
    if (target.id===user.id) return interaction.reply({content:'❌ Нельзя вызвать самого себя на дуэль!',ephemeral:true});
    if (target.bot) return interaction.reply({content:'❌ Нельзя вызвать бота!',ephemeral:true});
    if (battles.has(user.id)) return interaction.reply({content:'❌ Ты уже в бою!',ephemeral:true});
    if (pvpBattles.has(user.id)) return interaction.reply({content:'❌ Ты уже в PvP дуэли!',ephemeral:true});
    const targetExists=db.prepare('SELECT id FROM players WHERE id=?').get(target.id);
    if (!targetExists) return interaction.reply({content:`❌ У <@${target.id}> нет персонажа! Сначала нужно написать **/start**.`,ephemeral:true});
    pendingDuels.set(target.id,user.id);
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel_accept_${user.id}`).setLabel('✅ Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`duel_decline_${user.id}`).setLabel('❌ Отказать').setStyle(ButtonStyle.Danger),
    );
    const cls=CLASSES[p.class]||CLASSES['Воин'];
    return interaction.reply({embeds:[new EmbedBuilder().setColor(cls.color).setTitle('⚔️ Вызов на дуэль!').setDescription(`${cls.emoji} **${user.username}** вызывает <@${target.id}> на поединок!\n\n<@${target.id}>, принимаешь вызов?`).addFields({name:'⚔️ Атака',value:`\`${p.attack}\``,inline:true},{name:'🛡️ Защита',value:`\`${p.defense}\``,inline:true},{name:'❤️ HP',value:`\`${p.hp}/${p.max_hp}\``,inline:true}).setTimestamp()],components:[row]});
  }

  // ── /gamble ──
  if (commandName==='gamble') {
    const game=interaction.options.getString('игра'), bet=interaction.options.getInteger('ставка');
    if (p.gold<bet) return interaction.reply({content:`❌ Недостаточно золота! У тебя ${p.gold}🪙`,ephemeral:true});
    let won=false, gain=0, desc='';

    if (game==='dice') {
      const d1=rand(1,6), d2=rand(1,6), sum=d1+d2;
      won=sum>=7;
      gain=won?bet*2:0;
      desc=`🎲 Выпало: **${d1}** + **${d2}** = **${sum}**\n${won?`Сумма ≥ 7 → Выигрыш **+${gain}🪙**!`:`Сумма < 7 → Проигрыш **-${bet}🪙**`}`;
    } else {
      // Блэкджек — упрощённый
      const deal=()=>rand(1,11);
      const playerCards=[deal(),deal()], dealerCards=[deal(),deal()];
      const pSum=playerCards.reduce((a,b)=>a+b,0);
      const dSum=dealerCards.reduce((a,b)=>a+b,0);
      won=pSum>dSum&&pSum<=21||(dSum>21);
      gain=won?Math.floor(bet*1.5):0;
      desc=`🃏 Твои карты: **${playerCards.join(' + ')}** = **${pSum}**\n🤖 Дилер: **${dealerCards.join(' + ')}** = **${dSum}**\n${pSum>21?'Перебор! Проигрыш':won?`Выигрыш **+${gain}🪙**!`:`Проигрыш **-${bet}🪙**`}`;
      if (pSum>21) { won=false; gain=0; }
    }

    if (won) { p.gold+=gain; p.casino_wins=(p.casino_wins||0)+1; }
    else p.gold-=bet;
    savePlayer(p);
    const newA=checkAchievements(p);

    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateCasinoCard(p,game==='dice'?'🎲 Кости':'🃏 Блэкджек',won,bet,gain), att=new AttachmentBuilder(buf,{name:'casino.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(won?0x2ECC71:0xE74C3C).setTitle(won?'🎰 ВЫИГРЫШ!':'🎰 ПРОИГРЫШ').setDescription(desc).setImage('attachment://casino.png').setFooter({text:`Осталось: ${p.gold}🪙`}).setTimestamp()],files:[att]});
    } catch { return interaction.reply({embeds:[new EmbedBuilder().setColor(won?0x2ECC71:0xE74C3C).setTitle(won?'🎰 ВЫИГРЫШ!':'🎰 ПРОИГРЫШ').setDescription(desc).setTimestamp()]}); }
  }

  // ── /customize ──
  if (commandName==='customize') {
    const CUSTOMIZE_COST=500, CUSTOMIZE_MIN_LEVEL=5;
    if (p.level<CUSTOMIZE_MIN_LEVEL) return interaction.reply({content:`❌ Смена расы доступна с **${CUSTOMIZE_MIN_LEVEL} уровня**! У тебя ${p.level}.`,ephemeral:true});
    if (p.gold<CUSTOMIZE_COST) return interaction.reply({content:`❌ Нужно **${CUSTOMIZE_COST}🪙** для смены расы. У тебя ${p.gold}🪙.`,ephemeral:true});
    const rn=interaction.options.getString('раса');
    if (rn===p.race) return interaction.reply({content:`❌ Ты уже **${rn}**!`,ephemeral:true});
    const race=RACES[rn], oldRace=RACES[p.race]||RACES['Человек'];
    p.gold-=CUSTOMIZE_COST;
    p.attack=p.attack-oldRace.atk+race.atk; p.defense=p.defense-oldRace.def+race.def;
    p.max_hp=p.max_hp-oldRace.hp+race.hp; p.hp=Math.min(p.hp,p.max_hp);
    p.max_mana=p.max_mana-oldRace.mana+race.mana; p.mana=Math.min(p.mana,p.max_mana);
    p.race=rn; savePlayer(p);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateProfileCard(p), att=new AttachmentBuilder(buf,{name:'profile.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(CLASSES[p.class]?.color||0x7289DA).setTitle(`${race.emoji} Раса изменена: ${rn}`).setDescription(`Бонус: \`${race.bonus}\``).setImage('attachment://profile.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:`${race.emoji} Раса: **${rn}**!`}); }
  }

  // ── /use ──
  if (commandName==='use') {
    const itemName=interaction.options.getString('предмет');

    // Проверяем — это карта?
    const cardItem=CARD_SHOP_ITEMS.find(c=>c.name.toLowerCase()===itemName.toLowerCase());
    if (cardItem) {
      const inv=getInventory(user.id);
      const owned=inv.find(i=>i.item===cardItem.name);
      if (!owned) return interaction.reply({content:`❌ У тебя нет **${cardItem.name}**. Купи в **/shop**!`,ephemeral:true});
      p.active_card=cardItem.tierId; savePlayer(p);
      await interaction.deferReply();
      try {
        const buf=await generateBankCard(p), att=new AttachmentBuilder(buf,{name:'card.png'});
        const tier=CARD_TIERS.find(t=>t.id===cardItem.tierId);
        return interaction.editReply({
          embeds:[new EmbedBuilder()
            .setColor(parseInt((tier?.accent||'#ffd700').replace('#',''),16))
            .setTitle(`${cardItem.emoji} ${cardItem.name} активирована!`)
            .setDescription(`Теперь это твоя активная карта. Смотри **/card**.`)
            .setImage('attachment://card.png').setTimestamp()],
          files:[att]
        });
      } catch { return interaction.editReply({content:`${cardItem.emoji} **${cardItem.name}** активирована!`}); }
    }

    // Обычный предмет
    const shopItem=SHOP_ITEMS.find(i=>i.name.toLowerCase()===itemName.toLowerCase());
    if (!shopItem) return interaction.reply({content:'❌ Предмет не найден в инвентаре.',ephemeral:true});
    if (!useItem(user.id,shopItem.name)) return interaction.reply({content:'❌ Нет этого предмета в инвентаре.',ephemeral:true});

    const [stat,val]=shopItem.effect.split('+'), amount=parseInt(val);
    let msg='';
    if (stat==='hp')  { p.hp=Math.min(p.max_hp,p.hp+amount); msg=`+${amount} HP`; }
    if (stat==='mana'){ p.mana=Math.min(p.max_mana,p.mana+amount); msg=`+${amount} маны`; }
    if (stat==='atk') { p.attack+=amount; msg=`+${amount} к атаке`; }
    if (stat==='def') { p.defense+=amount; msg=`+${amount} к защите`; }
    if (stat==='xp')  { p.xp+=amount; checkLevelUp(p); msg=`+${amount} XP`; }
    savePlayer(p);
    return interaction.reply({content:`${shopItem.emoji} **${shopItem.name}** использован! ${msg}`});
  }

  // ── /drop ──
  if (commandName==='drop') {
    const itemName=interaction.options.getString('предмет');
    const inv=getInventory(user.id);
    const owned=inv.find(i=>i.item.toLowerCase()===itemName.toLowerCase());
    if (!owned) return interaction.reply({content:`❌ Предмет **${itemName}** не найден в инвентаре.`,ephemeral:true});
    const isActiveCard=CARD_SHOP_ITEMS.find(c=>c.name.toLowerCase()===owned.item.toLowerCase()&&c.tierId===p.active_card);
    if (isActiveCard) { p.active_card=''; savePlayer(p); }
    useItem(user.id,owned.item);
    return interaction.reply({content:`🗑️ **${owned.item}** выброшен из инвентаря.`,ephemeral:true});
  }

  // ── /sell ──
  if (commandName==='sell') {
    const cardName=interaction.options.getString('карта');
    const cardItem=CARD_SHOP_ITEMS.find(c=>c.name.toLowerCase()===cardName.toLowerCase());
    if (!cardItem) return interaction.reply({content:`❌ **${cardName}** — не карта. Продавать можно только карты.`,ephemeral:true});
    const inv=getInventory(user.id);
    const owned=inv.find(i=>i.item.toLowerCase()===cardName.toLowerCase());
    if (!owned) return interaction.reply({content:`❌ У тебя нет **${cardItem.name}** в инвентаре.`,ephemeral:true});
    const sellPrice=Math.floor(cardItem.price*0.4);
    if (p.active_card===cardItem.tierId) { p.active_card=''; }
    p.gold+=sellPrice; savePlayer(p);
    useItem(user.id, cardItem.name);
    return interaction.reply({embeds:[new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle(`${cardItem.emoji} Карта продана!`)
      .setDescription(`Продана **${cardItem.name}**\n\n💰 Получено: **${sellPrice.toLocaleString('ru')} 🪙** (40% от ${cardItem.price.toLocaleString('ru')}🪙)\n👛 Кошелёк: **${p.gold.toLocaleString('ru')} 🪙**`)
      .setFooter({text:'Купи новую карту в /shop!'})
      .setTimestamp()
    ]});
  }

  // ── /market ──
  if (commandName==='market') {
    const itemArg = interaction.options.getString('предмет');
    const priceArg = interaction.options.getInteger('цена');

    // Авто-выкуп ботом просроченных лотов
    const AUTO_BUY_MS = 12 * 60 * 60 * 1000;
    const expired = db.prepare('SELECT * FROM market WHERE listed_at < ?').all(Date.now() - AUTO_BUY_MS);
    for (const lot of expired) {
      const seller = db.prepare('SELECT * FROM players WHERE id=?').get(lot.seller_id);
      if (seller) {
        const botPay = Math.floor(lot.price * 0.4);
        db.prepare('UPDATE players SET gold=gold+? WHERE id=?').run(botPay, lot.seller_id);
      }
      db.prepare('DELETE FROM market WHERE id=?').run(lot.id);
    }

    // Выставить предмет на рынок
    if (itemArg && priceArg) {
      const inv = getInventory(user.id);
      const cardItem = [...CARD_SHOP_ITEMS].find(c => c.name.toLowerCase() === itemArg.toLowerCase());
      const gearItem = inv.find(i => i.item.toLowerCase() === itemArg.toLowerCase());
      if (!cardItem && !gearItem) return interaction.reply({content:`❌ Предмет **${itemArg}** не найден в инвентаре.`,ephemeral:true});

      const itemName = cardItem ? cardItem.name : gearItem.item;
      const itemType = cardItem ? 'card' : 'gear';

      if (cardItem) {
        const hasCard = inv.find(i => i.item === cardItem.name);
        if (!hasCard) return interaction.reply({content:`❌ Карты **${cardItem.name}** нет в инвентаре.`,ephemeral:true});
        if (p.active_card === cardItem.tierId) return interaction.reply({content:`❌ Нельзя выставить активную карту. Сначала смени карту через /use.`,ephemeral:true});
      }

      // Лимит: 3 лота одновременно
      const myLots = db.prepare('SELECT COUNT(*) as c FROM market WHERE seller_id=?').get(user.id);
      if (myLots.c >= 3) return interaction.reply({content:`❌ Максимум 3 лота на рынке одновременно.`,ephemeral:true});

      // Снимаем предмет с игрока
      removeItem(user.id, itemName);
      db.prepare('INSERT INTO market (seller_id,seller_name,item,item_type,price,listed_at) VALUES (?,?,?,?,?,?)')
        .run(user.id, p.name, itemName, itemType, priceArg, Date.now());

      return interaction.reply({content:`✅ **${itemName}** выставлен на рынок за **${priceArg.toLocaleString('ru')}🪙**.\nЧерез 12ч без покупателя бот выкупит за **${Math.floor(priceArg*0.4).toLocaleString('ru')}🪙**.`,ephemeral:true});
    }

    // Показать рынок
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    const listings = db.prepare('SELECT * FROM market ORDER BY listed_at DESC').all();
    try {
      const buf = await generateMarketCard(listings, p);
      const att = new AttachmentBuilder(buf, {name:'market.png'});
      const rows = [];
      const buyable = listings.filter(l => l.seller_id !== user.id);
      if (buyable.length > 0) {
        for (let i = 0; i < Math.min(buyable.length, 5); i++) {
          const lot = buyable[i];
          rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`market_buy_${lot.id}`)
              .setLabel(`Купить #${lot.id}: ${lot.item} — ${lot.price.toLocaleString('ru')}🪙`)
              .setStyle(p.gold >= lot.price ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(p.gold < lot.price)
          ));
        }
      }
      // Кнопка снять свой лот
      const myLot = listings.find(l => l.seller_id === user.id);
      if (myLot) {
        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`market_cancel_${myLot.id}`).setLabel(`❌ Снять лот #${myLot.id}`).setStyle(ButtonStyle.Danger)
        ));
      }
      return interaction.editReply({
        embeds:[new EmbedBuilder().setColor(0xe67e22).setTitle('🛒 Рынок игроков').setImage('attachment://market.png').setTimestamp()],
        files:[att], components: rows
      });
    } catch(e) {
      const text = listings.length ? listings.map(l=>`**${l.item}** — ${l.price}🪙 (от ${l.seller_name})`).join('\n') : 'Рынок пуст.';
      return interaction.editReply({content:`🛒 **Рынок:**\n${text}`});
    }
  }

  // ── /explore ──
  if (commandName==='explore') {
    if (battles.has(user.id)) return interaction.reply({content:'⚔️ Нельзя исследовать во время боя!',ephemeral:true});
    const { EXPLORE_EVENTS } = require('../data/constants');
    const today = new Date().toDateString();
    const maxExplores = p.profession==='Следопыт' ? 4 : 3;
    if (p.explore_date===today && (p.explore_used_today||0)>=maxExplores)
      return interaction.reply({content:`🗺️ Ты уже исследовал **${maxExplores} раза** сегодня. Приходи завтра!`,ephemeral:true});
    if (p.explore_date!==today) { p.explore_used_today=0; p.explore_date=today; }

    const locKey = p.location||'Лес';
    const events = EXPLORE_EVENTS[locKey] || EXPLORE_EVENTS['Лес'];
    const totalW = events.reduce((s,e)=>s+e.w,0);
    let r=rand(1,totalW), event=events[events.length-1];
    for(const e of events){ r-=e.w; if(r<=0){event=e;break;} }

    // Следопыт: +20% к находкам
    const bonusMult = p.profession==='Следопыт' ? 1.2 : 1;
    const season = getSeasonalEvent();

    let resultText='', goldGain=0, xpGain=0, hpGain=0, manaGain=0, showShop=false;
    switch(event.type) {
      case 'gold': {
        goldGain = Math.floor(rand(event.val[0],event.val[1]) * bonusMult);
        if(season?.bonus==='gold') goldGain=Math.floor(goldGain*season.mult);
        p.gold+=goldGain; p.gold_earned=(p.gold_earned||0)+goldGain;
        resultText=`+${goldGain} 🪙 золота`; break;
      }
      case 'xp': {
        xpGain=Math.floor(rand(event.val[0],event.val[1])*bonusMult);
        if(season?.bonus==='xp') xpGain=Math.floor(xpGain*season.mult);
        p.xp+=xpGain; resultText=`+${xpGain} XP`; break;
      }
      case 'hp': { hpGain=rand(event.val[0],event.val[1]); p.hp=Math.min(p.hp+hpGain,p.max_hp); resultText=`+${hpGain} ❤️ HP`; break; }
      case 'mana': { manaGain=rand(event.val[0],event.val[1]); p.mana=Math.min(p.mana+manaGain,p.max_mana); resultText=`+${manaGain} 💙 Маны`; break; }
      case 'hpmana': { hpGain=event.val[0]; manaGain=event.val[1]; p.hp=Math.min(p.hp+hpGain,p.max_hp); p.mana=Math.min(p.mana+manaGain,p.max_mana); resultText=`+${hpGain}❤️  +${manaGain}💙`; break; }
      case 'xpmana': { xpGain=event.val[0]; manaGain=event.val[1]; p.xp+=xpGain; p.mana=Math.min(p.mana+manaGain,p.max_mana); resultText=`+${xpGain}XP  +${manaGain}💙`; break; }
      case 'goldxp': { goldGain=Math.floor(event.val[0]*bonusMult); xpGain=event.val[1]; p.gold+=goldGain; p.gold_earned=(p.gold_earned||0)+goldGain; p.xp+=xpGain; resultText=`+${goldGain}🪙  +${xpGain}XP`; break; }
      case 'all': { goldGain=Math.floor(event.val[0]*bonusMult); xpGain=event.val[1]; hpGain=40; p.gold+=goldGain; p.gold_earned=(p.gold_earned||0)+goldGain; p.xp+=xpGain; p.hp=Math.min(p.hp+hpGain,p.max_hp); resultText=`+${goldGain}🪙  +${xpGain}XP  +${hpGain}❤️`; break; }
      case 'dmg': { const dmg=rand(event.val[0],event.val[1]); p.hp=Math.max(1,p.hp-dmg); resultText=`-${dmg} ❤️ HP  (HP: ${p.hp}/${p.max_hp})`; break; }
      case 'drain': { const d=event.val[0]; p.hp=Math.max(1,p.hp-d); p.mana=Math.max(0,p.mana-event.val[1]); resultText=`-${d}❤️  -${event.val[1]}💙`; break; }
      case 'atk_temp': { resultText=`Атака временно усилена! (до конца дня)`; break; }
      case 'shop': { showShop=true; resultText='Выбери предмет со скидкой 50%!'; break; }
    }
    const lvlMsgs=checkLevelUp(p);
    p.explore_used_today=(p.explore_used_today||0)+1;
    const qRow=db.prepare('SELECT * FROM quests WHERE player_id=?').get(user.id);
    if(qRow) {
      const qDef=QUESTS_LIST.find(q=>q.name===qRow.quest);
      if(qDef?.type==='explore') db.prepare('UPDATE quests SET progress=progress+1 WHERE player_id=?').run(user.id);
    }
    savePlayer(p);
    await interaction.deferReply({ephemeral:isEphemeral??false});
    const usedStr=`${p.explore_used_today}/${maxExplores}`;
    try {
      const buf=await generateExploreCard(p,event,resultText), att=new AttachmentBuilder(buf,{name:'explore.png'});
      const embed=new EmbedBuilder().setColor(parseInt((LOCATIONS[locKey].color).replace('#',''),16))
        .setTitle(`🗺️ Исследование — ${locKey}  [${usedStr} сегодня]`)
        .setImage('attachment://explore.png').setTimestamp();
      if(lvlMsgs.length) embed.setDescription(`🎉 ${lvlMsgs[0]}`);
      if(season) embed.setFooter({text:`${season.name}: ${season.desc}`});
      const components=[];
      if(showShop){
        const discItems=SHOP_ITEMS.map(i=>new ButtonBuilder().setCustomId(`explore_buy_${i.name}`).setLabel(`${i.emoji} ${i.name} — ${Math.floor(i.price*0.5)}🪙`).setStyle(ButtonStyle.Success));
        components.push(new ActionRowBuilder().addComponents(discItems.slice(0,4)));
        if(discItems.length>4) components.push(new ActionRowBuilder().addComponents(discItems.slice(4)));
      }
      return interaction.editReply({embeds:[embed],files:[att],components});
    } catch { return interaction.editReply({content:`🗺️ **${event.title}**: ${resultText}`}); }
  }

  // ── /upgrade ──
  if (commandName==='upgrade') {
    const itemName=interaction.options.getString('предмет');
    const inv=getInventory(user.id);
    const owned=inv.find(i=>i.item.toLowerCase()===itemName.toLowerCase());
    if(!owned) return interaction.reply({content:`❌ Предмет **${itemName}** не найден в инвентаре.`,ephemeral:true});
    const shopItem=SHOP_ITEMS.find(s=>s.name===owned.item);
    if(!shopItem) return interaction.reply({content:`❌ Можно улучшать только снаряжение из магазина.`,ephemeral:true});
    const curLvl=getUpgradeLevel(user.id,owned.item);
    if(curLvl>=5) return interaction.reply({content:`✅ **${owned.item}** уже на максимальном уровне +${curLvl*2}!`,ephemeral:true});
    const profMult=p.profession==='Кузнец'?0.7:1;
    const cost=Math.floor(200*(curLvl+1)*profMult);
    await interaction.deferReply({ephemeral:isEphemeral??false});
    try {
      const buf=await generateUpgradeCard(p,owned.item,curLvl,curLvl+1,cost,null), att=new AttachmentBuilder(buf,{name:'upgrade.png'});
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`upgrade_confirm_${owned.item}`).setLabel(`🔨 Улучшить за ${cost}🪙`).setStyle(p.gold>=cost?ButtonStyle.Success:ButtonStyle.Secondary).setDisabled(p.gold<cost),
      );
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0xf39c12).setTitle(`🔨 Улучшение: ${owned.item} [+${curLvl*2} → +${(curLvl+1)*2}]`).setImage('attachment://upgrade.png').setTimestamp()],files:[att],components:[row]});
    } catch { return interaction.editReply({content:`🔨 Улучшить **${owned.item}** (ур.${curLvl}→${curLvl+1}) за **${cost}🪙**?`}); }
  }

  // ── /profession ──
  if (commandName==='profession') {
    const profArg=interaction.options.getString('профессия');
    await interaction.deferReply({ephemeral:isEphemeral??false});
    if(!profArg) {
      const buf=await generateProfessionCard(p), att=new AttachmentBuilder(buf,{name:'prof.png'});
      const profEntries=Object.entries(PROFESSIONS);
      const rows=[];
      for(let i=0;i<profEntries.length;i+=3){
        const btns=profEntries.slice(i,i+3).map(([name,prof])=>new ButtonBuilder()
          .setCustomId(`prof_pick_${name}`)
          .setLabel(`${prof.emoji} ${name}`)
          .setStyle(p.profession===name?ButtonStyle.Success:ButtonStyle.Primary)
          .setDisabled(p.profession===name));
        rows.push(new ActionRowBuilder().addComponents(btns));
      }
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x9b59b6).setTitle('⚗️ Профессии').setImage('attachment://prof.png').setTimestamp()],files:[att],components:rows});
    }
    const prof=PROFESSIONS[profArg];
    if(!prof) return interaction.editReply({content:`❌ Профессия не найдена. Доступно: ${Object.keys(PROFESSIONS).join(', ')}`});
    if(p.profession===profArg) return interaction.editReply({content:`Ты уже **${profArg}**!`});
    const cost=p.profession?500:0;
    if(p.gold<cost) return interaction.editReply({content:`💸 Смена профессии стоит **500🪙**. У тебя ${p.gold}🪙.`});
    p.gold-=cost; p.profession=profArg; savePlayer(p);
    const buf=await generateProfessionCard(p), att=new AttachmentBuilder(buf,{name:'prof.png'});
    return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x9b59b6).setTitle(`${prof.emoji} Профессия: ${profArg}!`).setDescription(prof.desc).setImage('attachment://prof.png').setTimestamp()],files:[att]});
  }

  // ── /trade ──
  if (commandName==='trade') {
    const target=interaction.options.getUser('игрок');
    const cardName=interaction.options.getString('карта');
    if (target.id===user.id) return interaction.reply({content:'❌ Нельзя обменяться с собой!',ephemeral:true});
    if (target.bot) return interaction.reply({content:'❌ Нельзя обменяться с ботом!',ephemeral:true});
    const cardItem=CARD_SHOP_ITEMS.find(c=>c.name.toLowerCase()===cardName.toLowerCase());
    if (!cardItem) return interaction.reply({content:`❌ **${cardName}** — не карта. Обменивать можно только карты.`,ephemeral:true});
    const inv=getInventory(user.id);
    const owned=inv.find(i=>i.item.toLowerCase()===cardName.toLowerCase());
    if (!owned) return interaction.reply({content:`❌ У тебя нет **${cardItem.name}** в инвентаре.`,ephemeral:true});
    if (pendingTrades.has(target.id)) return interaction.reply({content:'❌ У этого игрока уже есть входящий обмен.',ephemeral:true});
    pendingTrades.set(target.id,{fromId:user.id, cardName:cardItem.name});
    setTimeout(()=>{ if(pendingTrades.get(target.id)?.fromId===user.id) pendingTrades.delete(target.id); }, 60000);
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade_accept_${user.id}`).setLabel('✅ Принять').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`trade_decline_${user.id}`).setLabel('❌ Отказать').setStyle(ButtonStyle.Danger),
    );
    const tier=CARD_TIERS.find(t=>t.id===cardItem.tierId);
    return interaction.reply({embeds:[new EmbedBuilder()
      .setColor(parseInt((tier?.accent||'#ffd700').replace('#',''),16))
      .setTitle(`${cardItem.emoji} Предложение обмена!`)
      .setDescription(`**${user.username}** хочет отдать тебе карту, <@${target.id}>!\n\n${cardItem.emoji} **${cardItem.name}**\n💰 Стоимость: ${cardItem.price.toLocaleString('ru')}🪙\n\n<@${target.id}>, принимаешь?`)
      .setFooter({text:'Предложение действует 60 секунд'})
      .setTimestamp()
    ],components:[row]});
  }

  // ── /help ──
  if (commandName==='help') {
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateHelpCard(), att=new AttachmentBuilder(buf,{name:'help.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x3498DB).setTitle('Справка по командам').setImage('attachment://help.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:'Используй команды: /fight /profile /shop /quest /daily /rest /top /duel /gamble /achievements /location /pet /guild /stats /weekly'}); }
  }

  // ── /stats ──
  if (commandName==='stats') {
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    const unlocked=db.prepare('SELECT name FROM achievements WHERE player_id=?').all(user.id).map(r=>r.name);
    try {
      const buf=await generateStatsCard(p,unlocked.length), att=new AttachmentBuilder(buf,{name:'stats.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(CLASSES[p.class]?.color||0x7289DA).setTitle(`Статистика: ${p.name}`).setImage('attachment://stats.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:`Побед: ${p.wins} | Поражений: ${p.losses} | Убито: ${p.kills_total||0}`}); }
  }

  // ── /weekly ──
  if (commandName==='weekly') {
    const week=getWeek();
    const top=db.prepare(`SELECT ws.player_id, ws.wins, ws.gold, p.name, p.class FROM weekly_stats ws JOIN players p ON p.id=ws.player_id WHERE ws.week=? ORDER BY ws.wins DESC, ws.gold DESC LIMIT 8`).all(week);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateTopCard(top.map(r=>({...r,level:0,losses:0,gold:r.gold,wins:r.wins}))), att=new AttachmentBuilder(buf,{name:'weekly.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x9B59B6).setTitle(`Недельный рейтинг — ${week}`).setImage('attachment://weekly.png').setTimestamp()],files:[att]});
    } catch { return interaction.reply({content:top.length?top.map((r,i)=>`**${i+1}.** ${r.name} — ${r.wins} побед, ${r.gold} золота`).join('\n'):'Пока нет данных за эту неделю.'}); }
  }

  // ── /pet ──
  if (commandName==='pet') {
    const petName=interaction.options.getString('питомец');
    if (!petName) {
      await interaction.deferReply({ ephemeral: isEphemeral??false });
      const PET_EMOJIS = { 'Волк':'🐺','Феникс':'🦅','Дракон':'🐉','Фея':'🧚','Медведь':'🐻' };
      const rows = [];
      const petEntries = Object.entries(PETS);
      for (let i = 0; i < petEntries.length; i += 3) {
        const btns = petEntries.slice(i, i+3).map(([name, pet]) => {
          const isOwned = p.pet === name;
          const canAfford = p.gold >= pet.cost;
          return new ButtonBuilder()
            .setCustomId(`pet_buy_${name}`)
            .setLabel(`${PET_EMOJIS[name]} ${name} — ${pet.cost}🪙`)
            .setStyle(isOwned ? ButtonStyle.Success : canAfford ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(isOwned);
        });
        rows.push(new ActionRowBuilder().addComponents(btns));
      }
      try {
        const buf = await generatePetShopCard(p), att = new AttachmentBuilder(buf, {name:'pets.png'});
        return interaction.editReply({
          embeds:[new EmbedBuilder().setColor(0xFF9800).setTitle('🐾 Питомцы').setImage('attachment://pets.png').setTimestamp()],
          files:[att], components: rows
        });
      } catch {
        const list = Object.entries(PETS).map(([n,pet])=>`**${n}** — ${pet.bonus} — ${pet.cost}г.`).join('\n');
        return interaction.editReply({content:`**Магазин питомцев:**\n\n${list}`, components: rows});
      }
    }
    const pet=PETS[petName];
    if (!pet) return interaction.reply({content:'❌ Питомец не найден.',ephemeral:true});
    if (p.pet===petName) return interaction.reply({content:`У тебя уже есть **${petName}**!`,ephemeral:true});
    if (p.gold<pet.cost) return interaction.reply({content:`❌ Нужно **${pet.cost} золота**. У тебя ${p.gold}.`,ephemeral:true});
    if (p.pet && PETS[p.pet]) {
      const old=PETS[p.pet]; p.attack-=old.atk; p.defense-=old.def; p.max_hp-=old.hp;
    }
    p.gold-=pet.cost; p.pet=petName; p.attack+=pet.atk; p.defense+=pet.def; p.max_hp+=pet.hp;
    p.hp=Math.min(p.hp,p.max_hp); savePlayer(p);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generatePetCard(p,petName), att=new AttachmentBuilder(buf,{name:'pet.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0xFF9800).setTitle(`Питомец куплен: ${petName}!`).setDescription(`Бонус: ${pet.bonus}`).setImage('attachment://pet.png').setTimestamp()],files:[att]});
    } catch { return interaction.editReply({content:`Питомец **${petName}** куплен! ${pet.bonus}`}); }
  }

  // ── /guild ──
  if (commandName==='guild') {
    const action=interaction.options.getString('действие');
    const arg=interaction.options.getString('аргумент')||'';

    if (action==='create') {
      if (!arg) return interaction.reply({content:'❌ Укажи название: /guild create <название>',ephemeral:true});
      if (p.gold<500) return interaction.reply({content:'❌ Создание гильдии стоит 500 золота.',ephemeral:true});
      const exists=db.prepare('SELECT id FROM guilds WHERE name=?').get(arg);
      if (exists) return interaction.reply({content:'❌ Гильдия с таким именем уже существует.',ephemeral:true});
      const gId=`g_${user.id}`;
      db.prepare('INSERT OR REPLACE INTO guilds (id,name,leader_id,treasury,created_at) VALUES (?,?,?,0,?)').run(gId,arg,user.id,new Date().toISOString());
      p.gold-=500; p.guild_id=gId; savePlayer(p);
      return interaction.reply({embeds:[new EmbedBuilder().setColor(0xE67E22).setTitle(`Гильдия создана: ${arg}`).setDescription(`Ты лидер! Казна: 0 золота`).setTimestamp()]});
    }

    if (action==='join') {
      if (!arg) return interaction.reply({content:'❌ Укажи название: /guild join <название>',ephemeral:true});
      const guild=db.prepare('SELECT * FROM guilds WHERE name=?').get(arg);
      if (!guild) return interaction.reply({content:'❌ Гильдия не найдена.',ephemeral:true});
      if (p.guild_id) return interaction.reply({content:'❌ Сначала выйди из текущей гильдии.',ephemeral:true});
      p.guild_id=guild.id; savePlayer(p);
      return interaction.reply({content:`✅ Ты вступил в гильдию **${guild.name}**!`});
    }

    if (action==='leave') {
      if (!p.guild_id) return interaction.reply({content:'❌ Ты не в гильдии.',ephemeral:true});
      p.guild_id=''; savePlayer(p);
      return interaction.reply({content:'✅ Ты покинул гильдию.'});
    }

    if (action==='donate') {
      const amount=parseInt(arg)||0;
      if (!p.guild_id) return interaction.reply({content:'❌ Ты не в гильдии.',ephemeral:true});
      if (amount<10) return interaction.reply({content:'❌ Минимум 10 золота.',ephemeral:true});
      if (p.gold<amount) return interaction.reply({content:`❌ У тебя только ${p.gold} золота.`,ephemeral:true});
      p.gold-=amount; savePlayer(p);
      db.prepare('UPDATE guilds SET treasury=treasury+? WHERE id=?').run(amount,p.guild_id);
      return interaction.reply({content:`✅ Пожертвовано **${amount} золота** в казну гильдии!`});
    }

    // info
    const guildId=p.guild_id||(arg?db.prepare('SELECT id FROM guilds WHERE name=?').get(arg)?.id:null);
    if (!guildId) return interaction.reply({content:'❌ Ты не в гильдии. Используй /guild join <название>',ephemeral:true});
    const guild=db.prepare('SELECT * FROM guilds WHERE id=?').get(guildId);
    if (!guild) return interaction.reply({content:'❌ Гильдия не найдена.',ephemeral:true});
    const members=db.prepare('SELECT p.*,CASE WHEN p.id=g.leader_id THEN \'leader\' ELSE \'member\' END as role FROM players p JOIN guilds g ON g.id=? WHERE p.guild_id=? ORDER BY p.level DESC').all(guildId,guildId);
    await interaction.deferReply({ ephemeral: isEphemeral??false });
    try {
      const buf=await generateGuildCard(guild,members), att=new AttachmentBuilder(buf,{name:'guild.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0xE67E22).setTitle(`Гильдия: ${guild.name}`).setImage('attachment://guild.png').setTimestamp()],files:[att]});
    } catch { return interaction.editReply({content:`Гильдия **${guild.name}**: ${members.length} участников, казна: ${guild.treasury} золота`}); }
  }

  // ── /card ──
  if (commandName==='card') {
    if (!p.active_card) return interaction.reply({content:'💳 У тебя нет карты! Купи в **/shop** — от 🥉 Бронзовой (500🪙) до ✨ Архаловской (150000🪙).',ephemeral:true});
    await interaction.deferReply();
    const tier=getActiveTier(p);
    try {
      const buf=await generateBankCard(p), att=new AttachmentBuilder(buf,{name:'card.png'});
      return interaction.editReply({
        embeds:[new EmbedBuilder()
          .setColor(parseInt(tier.accent.replace('#',''),16))
          .setImage('attachment://card.png')
          .setTimestamp()],
        files:[att]
      });
    } catch {
      return interaction.editReply({content:`${tier.emoji} **${tier.name} карта** · 💰 ${p.card_gold||0}🪙 · 👛 ${p.gold}🪙`});
    }
  }

  // ── /deposit ──
  if (commandName==='deposit') {
    const amount=interaction.options.getInteger('сумма');
    if (p.gold < amount) return interaction.reply({content:`❌ У тебя только **${p.gold} 🪙** в кошельке.`,ephemeral:true});

    const MAX_CARD=100000;
    const currentCard=p.card_gold||0;
    if (currentCard>=MAX_CARD) return interaction.reply({content:`❌ Карта уже заполнена до максимума (100 000 🪙)!`,ephemeral:true});

    const tierBefore=getCardTier(currentCard);
    const canDeposit=Math.min(amount, MAX_CARD-currentCard);
    const overflow=amount-canDeposit;

    p.gold -= canDeposit;
    p.card_gold = currentCard + canDeposit;
    savePlayer(p);

    const tierAfter=getCardTier(p.card_gold);
    const upgraded=tierAfter.rank > tierBefore.rank;

    await interaction.deferReply();
    try {
      const buf=await generateBankCard(p), att=new AttachmentBuilder(buf,{name:'card.png'});
      let desc=`✅ Положено **${canDeposit.toLocaleString('ru')} 🪙** на карту.`;
      if (overflow>0) desc+=`\n⚠️ Карта заполнена — **${overflow.toLocaleString('ru')} 🪙** остались в кошельке.`;
      if (upgraded) desc+=`\n🎉 Тир повышен: **${tierBefore.emoji} ${tierBefore.name}** → **${tierAfter.emoji} ${tierAfter.name}**!`;
      return interaction.editReply({
        embeds:[new EmbedBuilder()
          .setColor(parseInt(tierAfter.accent.replace('#',''),16))
          .setTitle(`${tierAfter.emoji} Депозит выполнен`)
          .setDescription(desc)
          .setImage('attachment://card.png')
          .setTimestamp()],
        files:[att]
      });
    } catch {
      let msg=`✅ Положено **${canDeposit} 🪙** · Карта: ${p.card_gold} 🪙 · Кошелёк: ${p.gold} 🪙`;
      if (upgraded) msg+=` · 🎉 Тир: ${tierAfter.emoji} ${tierAfter.name}!`;
      return interaction.editReply({content:msg});
    }
  }

  // ── /withdraw ──
  if (commandName==='withdraw') {
    const amount=interaction.options.getInteger('сумма');
    const currentCard=p.card_gold||0;
    if (currentCard < amount) return interaction.reply({content:`❌ На карте только **${currentCard.toLocaleString('ru')} 🪙**.`,ephemeral:true});

    const tierBefore=getCardTier(currentCard);
    p.card_gold = currentCard - amount;
    p.gold += amount;
    savePlayer(p);
    const tierAfter=getCardTier(p.card_gold);
    const downgraded=tierAfter.rank < tierBefore.rank;

    await interaction.deferReply();
    try {
      const buf=await generateBankCard(p), att=new AttachmentBuilder(buf,{name:'card.png'});
      let desc=`✅ Снято **${amount.toLocaleString('ru')} 🪙** с карты в кошелёк.`;
      if (downgraded) desc+=`\n📉 Тир понизился: **${tierBefore.emoji} ${tierBefore.name}** → **${tierAfter.emoji} ${tierAfter.name}**.`;
      return interaction.editReply({
        embeds:[new EmbedBuilder()
          .setColor(parseInt(tierAfter.accent.replace('#',''),16))
          .setTitle(`${tierAfter.emoji} Снятие выполнено`)
          .setDescription(desc)
          .setImage('attachment://card.png')
          .setTimestamp()],
        files:[att]
      });
    } catch {
      let msg=`✅ Снято **${amount} 🪙** · Карта: ${p.card_gold} 🪙 · Кошелёк: ${p.gold} 🪙`;
      if (downgraded) msg+=` · 📉 Тир: ${tierAfter.emoji} ${tierAfter.name}`;
      return interaction.editReply({content:msg});
    }
  }
}

module.exports = { handleCmd, battleEmbed, divider, autoDelete, EPHEMERAL_CMDS };
