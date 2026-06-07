'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const {
  CLASSES, SHOP_ITEMS, CARD_SHOP_ITEMS, CARD_TIERS, PROFESSIONS, PETS, RANDOM_EVENTS,
  MONSTERS, LOCATIONS, QUESTS_LIST, EXPLORE_EVENTS, ACHIEVEMENTS_LIST,
  rand, getCardBonuses, getSeasonalEvent,
} = require('../data/constants');
const {
  db, getPlayer, savePlayer, checkLevelUp, getInventory, addItem, useItem,
  addWeeklyWin, checkAchievements, unlockAchievement, getUpgradeLevel, setUpgradeLevel,
} = require('../db/queries');
const {
  generateBattleCard, generateResultCard, generateRestCard, generateInventoryCard,
  generateUpgradeCard, generateProfessionCard, generatePetShopCard, generateMarketCard,
  generateProfileCard, generateShopCard, generateDailyCard, generateQuestCard,
  generateAchievementsCard, generateExploreCard, generateHelpCard, generateStatsCard,
} = require('../canvas/generators');
const {
  battles, pvpBattles, pendingDuels, pendingTrades, processingInteractions,
  fightCooldowns, FIGHT_COOLDOWN_MS,
} = require('../state');
const { battleEmbed, divider, autoDelete } = require('./commands');

async function handleBtn(interaction) {
  if (processingInteractions.has(interaction.id)) {
    try { await interaction.deferUpdate(); } catch {}
    return;
  }
  processingInteractions.add(interaction.id);
  setTimeout(() => processingInteractions.delete(interaction.id), 10_000);
  const { customId, user } = interaction;
  const p = getPlayer(user.id, user.username);

  // ── Отдых (выбор оплаты) ──
  if (customId.startsWith('rest_wait_')) {
    const waitMins = parseInt(customId.split('_').pop());
    if ((p.free_rest_until||0) > 0) return interaction.reply({content:`⏳ Ты уже ждёшь! Используй /rest когда время выйдет.`,ephemeral:true});
    p.free_rest_until = Date.now() + waitMins * 60 * 1000;
    savePlayer(p);
    const hpPct = p.hp / p.max_hp;
    const injuryEmoji = hpPct > 0.75 ? '🩹' : hpPct > 0.5 ? '🩸' : hpPct > 0.25 ? '💔' : '☠️';
    return interaction.update({
      embeds:[new EmbedBuilder().setColor(0x4a4a6a)
        .setTitle('😴 Отдыхаешь...')
        .setDescription(`${injuryEmoji} Ты лёг отдыхать.\n\n⏳ Восстановление через **${waitMins} минут**.\nКогда время выйдет — используй \`/rest\` снова.`)
        .setTimestamp()],
      components:[]
    });
  }

  if (customId.startsWith('rest_wallet_') || customId.startsWith('rest_card_')) {
    const fromCard = customId.startsWith('rest_card_');
    const restCost = parseInt(customId.split('_').pop());
    if (fromCard) {
      if ((p.card_gold||0) < restCost) return interaction.reply({content:`❌ На карте только ${p.card_gold||0}🪙.`,ephemeral:true});
      p.card_gold -= restCost;
    } else {
      if (p.gold < restCost) return interaction.reply({content:`❌ В кошельке только ${p.gold}🪙.`,ephemeral:true});
      p.gold -= restCost;
    }
    p.hp=p.max_hp; p.mana=p.max_mana; savePlayer(p);
    await interaction.deferUpdate();
    try {
      const buf=await generateRestCard(p,restCost,fromCard?'card':'wallet'), att=new AttachmentBuilder(buf,{name:'rest.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x27AE60).setTitle('🏠 Таверна').setImage('attachment://rest.png').setTimestamp()],files:[att],components:[]});
    } catch {
      return interaction.editReply({content:`✅ Восстановлен! Потрачено **${restCost}🪙** ${fromCard?'с карты':'из кошелька'}.`,components:[]});
    }
  }

  // ── Рынок: купить лот ──
  if (customId.startsWith('market_buy_')) {
    const lotId = parseInt(customId.replace('market_buy_',''));
    const lot = db.prepare('SELECT * FROM market WHERE id=?').get(lotId);
    if (!lot) return interaction.reply({content:'❌ Лот уже куплен или снят.',ephemeral:true});
    if (lot.seller_id === user.id) return interaction.reply({content:'❌ Нельзя купить свой лот.',ephemeral:true});
    if (p.gold < lot.price) return interaction.reply({content:`💸 Нужно **${lot.price.toLocaleString('ru')}🪙**, у тебя **${p.gold.toLocaleString('ru')}🪙**.`,ephemeral:true});
    p.gold -= lot.price; savePlayer(p);
    addItem(user.id, lot.item);
    db.prepare('UPDATE players SET gold=gold+? WHERE id=?').run(lot.price, lot.seller_id);
    db.prepare('DELETE FROM market WHERE id=?').run(lotId);
    await interaction.deferUpdate();
    const listings = db.prepare('SELECT * FROM market ORDER BY listed_at DESC').all();
    try {
      const buf = await generateMarketCard(listings, p), att = new AttachmentBuilder(buf,{name:'market.png'});
      const rows = [];
      const buyable = listings.filter(l => l.seller_id !== user.id);
      for (let i=0;i<Math.min(buyable.length,5);i++) {
        const l=buyable[i];
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`market_buy_${l.id}`).setLabel(`Купить #${l.id}: ${l.item} — ${l.price.toLocaleString('ru')}🪙`).setStyle(p.gold>=l.price?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(p.gold<l.price)));
      }
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0xe67e22).setTitle(`✅ Куплено: ${lot.item}!`).setImage('attachment://market.png').setTimestamp()],files:[att],components:rows});
    } catch { return interaction.editReply({content:`✅ Куплено **${lot.item}** за **${lot.price}🪙**!`,components:[]}); }
  }

  // ── Рынок: снять лот ──
  if (customId.startsWith('market_cancel_')) {
    const lotId = parseInt(customId.replace('market_cancel_',''));
    const lot = db.prepare('SELECT * FROM market WHERE id=?').get(lotId);
    if (!lot) return interaction.reply({content:'❌ Лот не найден.',ephemeral:true});
    if (lot.seller_id !== user.id) return interaction.reply({content:'❌ Это не твой лот.',ephemeral:true});
    addItem(user.id, lot.item);
    db.prepare('DELETE FROM market WHERE id=?').run(lotId);
    return interaction.reply({content:`✅ Лот снят, **${lot.item}** возвращён в инвентарь.`,ephemeral:true});
  }

  // ── Explore: покупка у торговца со скидкой 50% ──
  if (customId.startsWith('explore_buy_')) {
    const itemName=customId.replace('explore_buy_','');
    const item=SHOP_ITEMS.find(i=>i.name===itemName);
    if(!item) return interaction.reply({content:'❌ Предмет не найден.',ephemeral:true});
    const price=Math.floor(item.price*0.5);
    if(p.gold<price) return interaction.reply({content:`💸 Нужно **${price}🪙**, у тебя **${p.gold}🪙**.`,ephemeral:true});
    p.gold-=price; savePlayer(p); addItem(user.id,item.name);
    return interaction.reply({content:`${item.emoji} Куплено **${item.name}** за **${price}🪙** (скидка 50%!)`,ephemeral:true});
  }

  // ── Upgrade: подтверждение улучшения ──
  if (customId.startsWith('upgrade_confirm_')) {
    const itemName=customId.replace('upgrade_confirm_','');
    const inv=getInventory(user.id);
    if(!inv.find(i=>i.item===itemName)) return interaction.reply({content:'❌ Предмет не найден в инвентаре.',ephemeral:true});
    const curLvl=getUpgradeLevel(user.id,itemName);
    if(curLvl>=5) return interaction.reply({content:`✅ Уже максимальный уровень!`,ephemeral:true});
    const profMult=p.profession==='Кузнец'?0.7:1;
    const cost=Math.floor(200*(curLvl+1)*profMult);
    if(p.gold<cost) return interaction.reply({content:`💸 Нужно **${cost}🪙**.`,ephemeral:true});
    p.gold-=cost;
    // Шанс успеха: 100% ур1-2, 80% ур3-4, 60% ур5
    const successChance=curLvl>=4?60:curLvl>=2?80:100;
    const success=rand(1,100)<=successChance;
    const newLvl=success?curLvl+1:curLvl;
    if(success) {
      setUpgradeLevel(user.id,itemName,newLvl);
      const shopItem=SHOP_ITEMS.find(s=>s.name===itemName);
      if(shopItem){
        if(shopItem.effect.includes('atk')) p.attack+=2;
        else if(shopItem.effect.includes('def')) p.defense+=2;
      }
    }
    savePlayer(p);
    await interaction.deferUpdate();
    try {
      const buf=await generateUpgradeCard(p,itemName,curLvl,newLvl,cost,success), att=new AttachmentBuilder(buf,{name:'upgrade.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(success?0x2ecc71:0xe74c3c).setTitle(success?`✅ ${itemName} улучшен до +${newLvl*2}!`:`❌ Провал! ${itemName} остался на +${curLvl*2}`).setImage('attachment://upgrade.png').setTimestamp()],files:[att],components:[]});
    } catch { return interaction.editReply({content:success?`✅ **${itemName}** улучшен! +${newLvl*2}`:`❌ Провал! Предмет цел, но улучшение не вышло.`,components:[]}); }
  }

  // ── Profession: выбор профессии кнопкой ──
  if (customId.startsWith('prof_pick_')) {
    const profName=customId.replace('prof_pick_','');
    const prof=PROFESSIONS[profName];
    if(!prof) return interaction.reply({content:'❌ Профессия не найдена.',ephemeral:true});
    if(p.profession===profName) return interaction.reply({content:'Уже выбрана!',ephemeral:true});
    const cost=p.profession?500:0;
    if(p.gold<cost) return interaction.reply({content:`💸 Смена профессии стоит **500🪙**. У тебя ${p.gold}🪙.`,ephemeral:true});
    p.gold-=cost; p.profession=profName; savePlayer(p);
    await interaction.deferUpdate();
    try {
      const buf=await generateProfessionCard(p), att=new AttachmentBuilder(buf,{name:'prof.png'});
      const profEntries=Object.entries(PROFESSIONS);
      const rows=[];
      for(let i=0;i<profEntries.length;i+=3){
        const btns=profEntries.slice(i,i+3).map(([name,pp])=>new ButtonBuilder().setCustomId(`prof_pick_${name}`).setLabel(`${pp.emoji} ${name}`).setStyle(p.profession===name?ButtonStyle.Success:ButtonStyle.Primary).setDisabled(p.profession===name));
        rows.push(new ActionRowBuilder().addComponents(btns));
      }
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x9b59b6).setTitle(`${prof.emoji} Профессия: ${profName}!`).setDescription(prof.desc).setImage('attachment://prof.png').setTimestamp()],files:[att],components:rows});
    } catch { return interaction.editReply({content:`✅ Профессия **${profName}** выбрана!`,components:[]}); }
  }

  // ── Покупка питомца ──
  if (customId.startsWith('pet_buy_')) {
    const petName = customId.replace('pet_buy_','');
    const pet = PETS[petName];
    if (!pet) return interaction.reply({content:'❌ Питомец не найден.',ephemeral:true});
    if (p.pet === petName) return interaction.reply({content:`У тебя уже есть **${petName}**!`,ephemeral:true});
    if (p.gold < pet.cost) return interaction.reply({content:`💸 Нужно **${pet.cost}🪙**, у тебя **${p.gold}🪙**`,ephemeral:true});
    if (p.pet && PETS[p.pet]) {
      const old=PETS[p.pet]; p.attack-=old.atk; p.defense-=old.def; p.max_hp-=old.hp;
    }
    p.gold-=pet.cost; p.pet=petName; p.attack+=pet.atk; p.defense+=pet.def; p.max_hp+=pet.hp;
    p.hp=Math.min(p.hp,p.max_hp); savePlayer(p);
    await interaction.deferUpdate();
    const PET_EMOJIS = { 'Волк':'🐺','Феникс':'🦅','Дракон':'🐉','Фея':'🧚','Медведь':'🐻' };
    try {
      const buf=await generatePetShopCard(p), att=new AttachmentBuilder(buf,{name:'pets.png'});
      const petEntries=Object.entries(PETS);
      const rows=[];
      for (let i=0;i<petEntries.length;i+=3) {
        const btns=petEntries.slice(i,i+3).map(([name,pp])=>new ButtonBuilder()
          .setCustomId(`pet_buy_${name}`).setLabel(`${PET_EMOJIS[name]} ${name} — ${pp.cost}🪙`)
          .setStyle(p.pet===name?ButtonStyle.Success:p.gold>=pp.cost?ButtonStyle.Primary:ButtonStyle.Secondary)
          .setDisabled(p.pet===name));
        rows.push(new ActionRowBuilder().addComponents(btns));
      }
      return interaction.editReply({
        embeds:[new EmbedBuilder().setColor(0xFF9800).setTitle(`🐾 Куплен: ${petName}! Бонус: ${pet.bonus}`).setImage('attachment://pets.png').setTimestamp()],
        files:[att], components:rows
      });
    } catch {
      return interaction.editReply({content:`✅ Питомец **${petName}** куплен! ${pet.bonus}`, components:[]});
    }
  }

  // ── Покупка снаряжения ──
  if (customId.startsWith('buy_')) {
    const item=SHOP_ITEMS.find(i=>i.name===customId.replace('buy_',''));
    if (!item) return interaction.reply({content:'❌ Не найден.',ephemeral:true});
    const bonuses=getCardBonuses(p);
    const finalPrice=Math.floor(item.price*(1-bonuses.shopDiscount));
    const discountNote=bonuses.shopDiscount>0?` (скидка ${Math.round(bonuses.shopDiscount*100)}% по карте)`:'';
    if (p.gold<finalPrice) return interaction.reply({content:`💸 Нужно **${finalPrice}🪙**${discountNote}, у тебя **${p.gold}🪙**`,ephemeral:true});
    p.gold-=finalPrice; savePlayer(p); addItem(user.id,item.name);
    const {goldEarned:ag1}=checkAchievements(p); if(ag1>0) savePlayer(p);
    return interaction.reply({content:`${item.emoji} Куплено **${item.name}** за **${finalPrice}🪙**${discountNote}! Используй **/use ${item.name}**`,ephemeral:true});
  }

  // ── Покупка карты ──
  if (customId.startsWith('buycard_')) {
    const tierId=customId.replace('buycard_','');
    const cardItem=CARD_SHOP_ITEMS.find(c=>c.tierId===tierId);
    if (!cardItem) return interaction.reply({content:'❌ Карта не найдена.',ephemeral:true});
    if (p.gold<cardItem.price) return interaction.reply({content:`💸 Нужно **${cardItem.price.toLocaleString('ru')}🪙**, у тебя **${p.gold}🪙**`,ephemeral:true});
    const inv=getInventory(user.id);
    const alreadyOwns=inv.find(i=>i.item===cardItem.name);
    if (alreadyOwns) return interaction.reply({content:`${cardItem.emoji} У тебя уже есть **${cardItem.name}**! Используй **/use ${cardItem.name}**`,ephemeral:true});
    p.gold-=cardItem.price; savePlayer(p); addItem(user.id,cardItem.name);
    return interaction.reply({content:`${cardItem.emoji} Куплена **${cardItem.name}**!\nИспользуй **/use ${cardItem.name}** чтобы активировать.`,ephemeral:true});
  }

  // ── Принять/отклонить дуэль ──
  if (customId.startsWith('duel_accept_')) {
    const challengerId=customId.replace('duel_accept_','');
    if (pendingDuels.get(user.id)!==challengerId) return interaction.reply({content:'❌ Эта дуэль не для тебя!',ephemeral:true});
    if (challengerId===user.id) return interaction.reply({content:'❌ Нельзя драться с собой!',ephemeral:true});
    const myChar=db.prepare('SELECT id FROM players WHERE id=?').get(user.id);
    if (!myChar) return interaction.reply({content:'❌ У тебя нет персонажа! Напиши **/start** чтобы создать.',ephemeral:true});
    const challenger=getPlayer(challengerId,'challenger');
    pendingDuels.delete(user.id);
    if (battles.has(user.id)||battles.has(challengerId)) return interaction.reply({content:'❌ Один из игроков уже в бою!',ephemeral:true});
    if (pvpBattles.has(challengerId)||pvpBattles.has(user.id)) return interaction.reply({content:'❌ Один из игроков уже в дуэли!',ephemeral:true});
    pvpBattles.set(challengerId,{p1id:challengerId,p2id:user.id,turn:1,cur:challengerId});
    const pvpRow=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pvp_attack').setLabel('⚔️ Атака').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('pvp_magic').setLabel('🔮 Магия').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pvp_flee').setLabel('🏃 Сдаться').setStyle(ButtonStyle.Secondary),
    );
    const cls1=CLASSES[challenger.class]||CLASSES['Воин'], cls2=CLASSES[p.class]||CLASSES['Воин'];
    return interaction.update({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle('⚔️  PvP Дуэль!')
      .setDescription(`**${cls1.emoji} ${challenger.name}** vs **${cls2.emoji} ${p.name}**\n\`${divider}\`\n> Ход **${challenger.name}** — выбирай действие!`)
      .addFields({name:challenger.name,value:`❤️ \`${challenger.hp}/${challenger.max_hp}\``,inline:true},{name:p.name,value:`❤️ \`${p.hp}/${p.max_hp}\``,inline:true})
      .setTimestamp()],components:[pvpRow]});
  }
  if (customId.startsWith('duel_decline_')) {
    return interaction.update({embeds:[new EmbedBuilder().setColor(0x95A5A6).setTitle('❌ Дуэль отклонена').setTimestamp()],components:[]});
  }

  // ── Обмен картой: принять ──
  if (customId.startsWith('trade_accept_')) {
    const fromId=customId.replace('trade_accept_','');
    const trade=pendingTrades.get(user.id);
    if (!trade||trade.fromId!==fromId) return interaction.reply({content:'❌ Это предложение уже недействительно.',ephemeral:true});
    pendingTrades.delete(user.id);
    const cardItem=CARD_SHOP_ITEMS.find(c=>c.name===trade.cardName);
    if (!cardItem) return interaction.update({content:'❌ Карта не найдена.',components:[]});
    const fromPlayer=getPlayer(fromId,'sender');
    const fromInv=getInventory(fromId);
    if (!fromInv.find(i=>i.item===trade.cardName)) return interaction.update({embeds:[new EmbedBuilder().setColor(0xe74c3c).setTitle('❌ Обмен отменён').setDescription('Карта больше не в инвентаре отправителя.')],components:[]});
    useItem(fromId, trade.cardName);
    if (fromPlayer.active_card===cardItem.tierId) { fromPlayer.active_card=''; savePlayer(fromPlayer); }
    addItem(user.id, trade.cardName);
    const tier=CARD_TIERS.find(t=>t.id===cardItem.tierId);
    return interaction.update({embeds:[new EmbedBuilder()
      .setColor(parseInt((tier?.accent||'#2ecc71').replace('#',''),16))
      .setTitle(`${cardItem.emoji} Обмен завершён!`)
      .setDescription(`<@${fromId}> передал **${cardItem.name}** → <@${user.id}>\n\nИспользуй **/use ${cardItem.name}** чтобы активировать!`)
      .setTimestamp()],components:[]});
  }

  // ── Обмен картой: отклонить ──
  if (customId.startsWith('trade_decline_')) {
    pendingTrades.delete(user.id);
    return interaction.update({embeds:[new EmbedBuilder().setColor(0x95A5A6).setTitle('❌ Обмен отклонён').setTimestamp()],components:[]});
  }

  // ── PvP ход ──
  if (customId.startsWith('pvp_')) {
    let battle=null, bKey=null;
    for (const [k,b] of pvpBattles) { if (b.p1id===user.id||b.p2id===user.id) { battle=b; bKey=k; break; } }
    if (!battle) return interaction.reply({content:'❌ Дуэль не найдена.',ephemeral:true});
    if (battle.cur!==user.id) return interaction.reply({content:'⏳ Не твой ход!',ephemeral:true});
    const attId=user.id, defId=attId===battle.p1id?battle.p2id:battle.p1id;
    const att=getPlayer(attId,''), def=getPlayer(defId,'');
    let log=[];
    if (customId==='pvp_attack') { const dmg=Math.max(1,att.attack-rand(0,def.defense)); def.hp-=dmg; log.push(`⚔️ **${att.name}** наносит **${dmg}** урона **${def.name}**`); }
    if (customId==='pvp_magic') { if (att.mana<15) return interaction.reply({content:'💙 Мало маны!',ephemeral:true}); const dmg=Math.max(5,Math.floor(att.attack*1.8)-rand(0,def.defense)); def.hp-=dmg; att.mana-=15; log.push(`🔮 **${att.name}** магический удар **${dmg}** по **${def.name}**`); }
    if (customId==='pvp_flee') { def.hp=Math.max(1,def.hp); savePlayer(att); savePlayer(def); pvpBattles.delete(bKey); return interaction.update({embeds:[new EmbedBuilder().setColor(0x95A5A6).setTitle(`🏳️ ${att.name} сдался!`).setDescription(`**${def.name}** победил в дуэли!`).setTimestamp()],components:[]}); }
    if (def.hp<=0) {
      def.hp=1; att.pvp_wins=(att.pvp_wins||0)+1;
      const reward=rand(30,80); att.gold+=reward;
      savePlayer(att); savePlayer(def); pvpBattles.delete(bKey);
      const {goldEarned:ag2}=checkAchievements(att); if(ag2>0) savePlayer(att);
      await interaction.update({embeds:[new EmbedBuilder().setColor(0x2ECC71).setTitle(`🏆 ${att.name} победил в дуэли!`).setDescription(log.map(l=>`> ${l}`).join('\n')+`\n\n💰 +${reward} золота за победу!`).setTimestamp()],components:[]});
      return;
    }
    savePlayer(att); savePlayer(def); battle.cur=defId; battle.turn++;
    const cls1=CLASSES[att.class]||CLASSES['Воин'], cls2=CLASSES[def.class]||CLASSES['Воин'];
    const pvpRow=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pvp_attack').setLabel('⚔️ Атака').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('pvp_magic').setLabel('🔮 Магия').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pvp_flee').setLabel('🏃 Сдаться').setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle(`⚔️ PvP · Ход ${battle.turn}`)
      .setDescription(log.map(l=>`> ${l}`).join('\n')+`\n\`${divider}\`\n> Ход **${def.name}** — атакуй!`)
      .addFields({name:`${cls1.emoji} ${att.name}`,value:`❤️ \`${att.hp}/${att.max_hp}\``,inline:true},{name:`${cls2.emoji} ${def.name}`,value:`❤️ \`${def.hp}/${def.max_hp}\``,inline:true})
      .setTimestamp()],components:[pvpRow]});
  }

  // ── /menu кнопки ──
  if (customId.startsWith('menu_')) {
    const action = customId.replace('menu_', '');

    if (action === 'fight') {
      if (p.hp <= 0) return interaction.update({ content: '💀 HP = 0! Используй **/rest**.', embeds: [], components: [] });
      if (battles.has(user.id)) return interaction.update({ content: '⚔️ Ты уже в бою!', embeds: [], components: [] });
      const lastFight = fightCooldowns.get(user.id) || 0;
      const remaining = Math.ceil((FIGHT_COOLDOWN_MS - (Date.now() - lastFight)) / 1000);
      if (remaining > 0) return interaction.update({ content: `⏳ Подожди ещё **${remaining} сек.** перед следующим боем.`, embeds: [], components: [] });
      fightCooldowns.set(user.id, Date.now());
      const loc = LOCATIONS[p.location || 'Лес'] || LOCATIONS['Лес'];
      const mName = loc.monsters[rand(0, loc.monsters.length - 1)];
      const mDef = MONSTERS[mName];
      const scale = 1 + (p.level - 1) * 0.15;
      const isElite = rand(1, 100) <= 20;
      const eScale = isElite ? scale * 1.5 : scale;
      const monster = { ...mDef, name: (isElite ? 'Элитный ' : '') + mName,
        hp: Math.round(mDef.hp * eScale), atk: Math.round(mDef.atk * eScale),
        def: Math.round(mDef.def * eScale), xp: Math.round(mDef.xp * eScale),
        gold: [Math.round(mDef.gold[0] * eScale), Math.round(mDef.gold[1] * eScale)],
        curHp: Math.round(mDef.hp * eScale), isElite, ability: mDef.ability,
        healedOnce: false, burnApplied: false };
      const cb = getCardBonuses(p);
      if (cb.hpBonus > 0) p.hp = Math.min(p.hp + Math.floor(p.max_hp * cb.hpBonus), Math.floor(p.max_hp * (1 + cb.hpBonus)));
      battles.set(user.id, { monster, turn: 1, startedAt: Date.now(), burnTurns: 0, burnDmg: 0, debuffAtk: 0, debuffTurns: 0, freezeTurns: 0, freezeAtkDebuff: 0, freezeDefDebuff: 0 });
      await interaction.deferUpdate();
      const fR = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fight_attack').setLabel('⚔️ Атака').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('fight_magic').setLabel('🔮 Магия').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('fight_inventory').setLabel('🎒 Инвентарь').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('fight_flee').setLabel('🏃 Бежать').setStyle(ButtonStyle.Secondary),
      );
      try {
        const buf = await generateBattleCard(p, battles.get(user.id)), att = new AttachmentBuilder(buf, { name: 'battle.png' });
        return interaction.editReply({ embeds: [battleEmbed(p, battles.get(user.id)).setImage('attachment://battle.png')], files: [att], components: [fR] });
      } catch { return interaction.editReply({ embeds: [battleEmbed(p, battles.get(user.id))], components: [fR] }); }
    }

    if (action === 'profile') {
      await interaction.deferUpdate();
      try {
        const buf = await generateProfileCard(p), att = new AttachmentBuilder(buf, { name: 'profile.png' });
        const cls = CLASSES[p.class] || CLASSES['Воин'];
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(parseInt(cls.color.replace('#',''),16)).setTitle(`${cls.emoji} ${p.name} · Ур.${p.level}`).setImage('attachment://profile.png').setTimestamp()], files: [att], components: [] });
      } catch { return interaction.editReply({ content: `${p.class} · Ур.${p.level} · ${p.gold}🪙`, embeds: [], components: [] }); }
    }

    if (action === 'shop') {
      const bonuses = getCardBonuses(p), disc = bonuses.shopDiscount || 0;
      const mkGear = i => new ButtonBuilder().setCustomId(`buy_${i.name}`).setLabel(`${i.emoji} ${i.name} — ${Math.floor(i.price*(1-disc))}🪙`).setStyle(ButtonStyle.Primary);
      const mkCard = c => new ButtonBuilder().setCustomId(`buycard_${c.tierId}`).setLabel(`${c.emoji} ${c.name} ${c.price>=1000?Math.round(c.price/1000)+'k':c.price}🪙`).setStyle(ButtonStyle.Success);
      await interaction.deferUpdate();
      try {
        const buf = await generateShopCard(p.gold, disc), att = new AttachmentBuilder(buf, { name: 'shop.png' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle('🏪 Магазин').setImage('attachment://shop.png').setFooter({text:'⚔️ Снаряжение · 💳 Карты'}).setTimestamp()], files: [att], components: [new ActionRowBuilder().addComponents(SHOP_ITEMS.slice(0,4).map(mkGear)), new ActionRowBuilder().addComponents(SHOP_ITEMS.slice(4).map(mkGear)), new ActionRowBuilder().addComponents(CARD_SHOP_ITEMS.slice(0,4).map(mkCard)), new ActionRowBuilder().addComponents(CARD_SHOP_ITEMS.slice(4).map(mkCard))] });
      } catch { return interaction.editReply({ content: 'Магазин временно недоступен.', embeds: [], components: [] }); }
    }

    if (action === 'inventory') {
      const items = getInventory(user.id);
      await interaction.deferUpdate();
      try {
        const buf = await generateInventoryCard(items, p), att = new AttachmentBuilder(buf, { name: 'inv.png' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8E44AD).setTitle('🎒 Инвентарь').setImage('attachment://inv.png').setTimestamp()], files: [att], components: [] });
      } catch { return interaction.editReply({ content: items.length ? items.map(i=>`${i.item} x${i.qty}`).join('\n') : '🎒 Пусто.', embeds: [], components: [] }); }
    }

    if (action === 'quest') {
      let q = db.prepare('SELECT * FROM quests WHERE player_id=?').get(user.id);
      if (!q) {
        const qDef = QUESTS_LIST[rand(0, QUESTS_LIST.length - 1)];
        db.prepare('INSERT INTO quests (player_id,quest,progress,goal,reward_xp,reward_gold) VALUES (?,?,0,?,?,?)').run(user.id, qDef.name, qDef.goal, qDef.xp, qDef.gold);
        q = db.prepare('SELECT * FROM quests WHERE player_id=?').get(user.id);
      }
      const quest = QUESTS_LIST.find(x => x.name === q.quest) || QUESTS_LIST[0];
      const done = q.progress >= q.goal;
      if (done) {
        p.xp += q.reward_xp; p.gold += q.reward_gold; p.quests_done = (p.quests_done||0) + 1;
        checkLevelUp(p); savePlayer(p);
        db.prepare('DELETE FROM quests WHERE player_id=?').run(user.id);
        const { goldEarned: achG } = checkAchievements(p); if (achG > 0) savePlayer(p);
      }
      await interaction.deferUpdate();
      try {
        const buf = await generateQuestCard(q, quest, done), att = new AttachmentBuilder(buf, { name: 'quest.png' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(done?0xF1C40F:0x1ABC9C).setTitle(done?'✅ Квест выполнен!':'📜 Активный квест').setImage('attachment://quest.png').setTimestamp()], files: [att], components: [] });
      } catch { return interaction.editReply({ content: done?`✅ Квест выполнен! +${q.reward_xp}XP +${q.reward_gold}🪙`:`📜 **${q.quest}** — ${q.progress}/${q.goal}`, embeds: [], components: [] }); }
    }

    if (action === 'daily') {
      const today = new Date().toDateString();
      if (p.last_daily === today) return interaction.update({ content: '⏰ Уже получил сегодня. Приходи завтра!', embeds: [], components: [] });
      const bonuses = getCardBonuses(p), season = getSeasonalEvent();
      const profD = PROFESSIONS[p.profession||''] || null;
      const baseGold = rand(30,80), baseXp = rand(20,50);
      let dailyMult = bonuses.dailyMult;
      if (profD?.xpBonus) dailyMult = Math.max(dailyMult, 1 + profD.xpBonus);
      if (season?.bonus === 'gold') dailyMult *= season.mult;
      const gold = Math.floor(baseGold * dailyMult), xp = Math.floor(baseXp * (season?.bonus==='xp' ? season.mult : 1));
      p.gold += gold; p.xp += xp; p.last_daily = today; p.gold_earned = (p.gold_earned||0) + gold;
      const lvl = checkLevelUp(p); savePlayer(p);
      const { goldEarned: achG } = checkAchievements(p); if (achG > 0) savePlayer(p);
      await interaction.deferUpdate();
      try {
        const buf = await generateDailyCard(p, gold, xp, lvl[0]||null), att = new AttachmentBuilder(buf, { name: 'daily.png' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('🎁 Ежедневная награда!').setImage('attachment://daily.png').setTimestamp()], files: [att], components: [] });
      } catch { return interaction.editReply({ content: `🎁 +${gold}🪙 +${xp}XP!`, embeds: [], components: [] }); }
    }

    if (action === 'explore') {
      if (battles.has(user.id)) return interaction.update({ content: '⚔️ Нельзя исследовать во время боя!', embeds: [], components: [] });
      const today = new Date().toDateString();
      const maxE = p.profession === 'Следопыт' ? 4 : 3;
      if (p.explore_date === today && (p.explore_used_today||0) >= maxE)
        return interaction.update({ content: `🗺️ Ты уже исследовал **${maxE}** раза сегодня. Приходи завтра!`, embeds: [], components: [] });
      if (p.explore_date !== today) { p.explore_used_today = 0; p.explore_date = today; }
      const locK = p.location || 'Лес';
      const evts = EXPLORE_EVENTS[locK] || EXPLORE_EVENTS['Лес'];
      const totW = evts.reduce((s,e) => s+e.w, 0);
      let rw = rand(1, totW), ev = evts[evts.length-1];
      for (const e of evts) { rw -= e.w; if (rw <= 0) { ev = e; break; } }
      const bMult = p.profession === 'Следопыт' ? 1.2 : 1;
      const season = getSeasonalEvent();
      let resultText = '', showShop = false;
      switch (ev.type) {
        case 'gold': { const g=Math.floor(rand(ev.val[0],ev.val[1])*bMult); p.gold+= season?.bonus==='gold'?Math.floor(g*season.mult):g; p.gold_earned=(p.gold_earned||0)+(season?.bonus==='gold'?Math.floor(g*season.mult):g); resultText=`+${season?.bonus==='gold'?Math.floor(g*season.mult):g}🪙`; break; }
        case 'xp': { const x=Math.floor(rand(ev.val[0],ev.val[1])*bMult); p.xp+= season?.bonus==='xp'?Math.floor(x*season.mult):x; resultText=`+${season?.bonus==='xp'?Math.floor(x*season.mult):x}XP`; break; }
        case 'hp': { const h=rand(ev.val[0],ev.val[1]); p.hp=Math.min(p.hp+h,p.max_hp); resultText=`+${h}❤️`; break; }
        case 'mana': { const m=rand(ev.val[0],ev.val[1]); p.mana=Math.min(p.mana+m,p.max_mana); resultText=`+${m}💙`; break; }
        case 'hpmana': { p.hp=Math.min(p.hp+ev.val[0],p.max_hp); p.mana=Math.min(p.mana+ev.val[1],p.max_mana); resultText=`+${ev.val[0]}❤️ +${ev.val[1]}💙`; break; }
        case 'xpmana': { p.xp+=ev.val[0]; p.mana=Math.min(p.mana+ev.val[1],p.max_mana); resultText=`+${ev.val[0]}XP +${ev.val[1]}💙`; break; }
        case 'goldxp': { const g2=Math.floor(ev.val[0]*bMult); p.gold+=g2; p.gold_earned=(p.gold_earned||0)+g2; p.xp+=ev.val[1]; resultText=`+${g2}🪙 +${ev.val[1]}XP`; break; }
        case 'all': { const g3=Math.floor(ev.val[0]*bMult); p.gold+=g3; p.gold_earned=(p.gold_earned||0)+g3; p.xp+=ev.val[1]; p.hp=Math.min(p.hp+40,p.max_hp); resultText=`+${g3}🪙 +${ev.val[1]}XP +40❤️`; break; }
        case 'dmg': { const d=rand(ev.val[0],ev.val[1]); p.hp=Math.max(1,p.hp-d); resultText=`-${d}❤️`; break; }
        case 'drain': { p.hp=Math.max(1,p.hp-ev.val[0]); p.mana=Math.max(0,p.mana-ev.val[1]); resultText=`-${ev.val[0]}❤️ -${ev.val[1]}💙`; break; }
        case 'atk_temp': { resultText='⚡ Атака усилена!'; break; }
        case 'shop': { showShop=true; resultText='Выбери предмет со скидкой 50%!'; break; }
      }
      checkLevelUp(p);
      p.explore_used_today = (p.explore_used_today||0) + 1;
      const qr = db.prepare('SELECT * FROM quests WHERE player_id=?').get(user.id);
      if (qr) { const qd=QUESTS_LIST.find(q=>q.name===qr.quest); if(qd?.type==='explore') db.prepare('UPDATE quests SET progress=progress+1 WHERE player_id=?').run(user.id); }
      savePlayer(p);
      await interaction.deferUpdate();
      try {
        const buf = await generateExploreCard(p, ev, resultText), att = new AttachmentBuilder(buf, { name: 'explore.png' });
        const locC = parseInt((LOCATIONS[locK]?.color||'#1abc9c').replace('#',''), 16);
        const emb = new EmbedBuilder().setColor(locC).setTitle(`🗺️ Исследование — ${locK} [${p.explore_used_today}/${maxE}]`).setImage('attachment://explore.png').setTimestamp();
        if (season) emb.setFooter({ text: `${season.name}: ${season.desc}` });
        const comps = [];
        if (showShop) {
          const di = SHOP_ITEMS.map(i => new ButtonBuilder().setCustomId(`explore_buy_${i.name}`).setLabel(`${i.emoji} ${i.name} — ${Math.floor(i.price*0.5)}🪙`).setStyle(ButtonStyle.Success));
          comps.push(new ActionRowBuilder().addComponents(di.slice(0,4)));
          if (di.length > 4) comps.push(new ActionRowBuilder().addComponents(di.slice(4)));
        }
        return interaction.editReply({ embeds: [emb], files: [att], components: comps });
      } catch { return interaction.editReply({ content: `🗺️ **${ev.title}**: ${resultText}`, embeds: [], components: [] }); }
    }

    if (action === 'achievements') {
      const unlocked = db.prepare('SELECT name FROM achievements WHERE player_id=?').all(user.id).map(r=>r.name);
      await interaction.deferUpdate();
      try {
        const buf = await generateAchievementsCard(p, unlocked), att = new AttachmentBuilder(buf, { name: 'ach.png' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle(`🏆 Достижения · ${unlocked.length}/${ACHIEVEMENTS_LIST.length}`).setImage('attachment://ach.png').setTimestamp()], files: [att], components: [] });
      } catch { return interaction.editReply({ content: `Достижений: ${unlocked.length}/${ACHIEVEMENTS_LIST.length}`, embeds: [], components: [] }); }
    }

    if (action === 'stats') {
      const unlocked = db.prepare('SELECT name FROM achievements WHERE player_id=?').all(user.id);
      await interaction.deferUpdate();
      try {
        const buf = await generateStatsCard(p, unlocked.length), att = new AttachmentBuilder(buf, { name: 'stats.png' });
        const clsC = parseInt((CLASSES[p.class]?.color||'#7289DA').replace('#',''), 16);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(clsC).setTitle(`📊 Статистика: ${p.name}`).setImage('attachment://stats.png').setTimestamp()], files: [att], components: [] });
      } catch { return interaction.editReply({ content: `Побед: ${p.wins} | Поражений: ${p.losses} | Убито: ${p.kills_total||0}`, embeds: [], components: [] }); }
    }

    if (action === 'help') {
      await interaction.deferUpdate();
      try {
        const buf = await generateHelpCard(), att = new AttachmentBuilder(buf, { name: 'help.png' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('❓ Справка по командам').setImage('attachment://help.png').setTimestamp()], files: [att], components: [] });
      } catch { return interaction.editReply({ content: '/fight /profile /shop /quest /daily /rest /achievements /explore /stats /menu', embeds: [], components: [] }); }
    }

    return;
  }

  // ── Обычный бой ──
  const battle=battles.get(user.id);
  if (!battle) return interaction.reply({content:'❌ Не в бою.',ephemeral:true});
  const m=battle.monster;
  let log=[];

  // Дебаффы: проклятие (-ATK) и заморозка (-ATK, -DEF)
  const effectiveAtk = Math.max(1, p.attack - (battle.debuffAtk||0) - (battle.freezeAtkDebuff||0));
  const effectiveDef = Math.max(0, p.defense - (battle.freezeDefDebuff||0));

  if (customId==='fight_attack') {
    let dmg=Math.max(1,effectiveAtk-rand(0,m.def));
    if (m.ability==='armor') dmg=Math.round(dmg*0.7);
    m.curHp-=dmg;
    log.push(`Ты наносишь **${dmg}** урона ${m.name}${m.ability==='armor'?' (броня)':''}`);
  }
  if (customId==='fight_magic') {
    if (p.mana<15) return interaction.reply({content:'Мало маны!',ephemeral:true});
    const dmg=Math.max(5,Math.floor(effectiveAtk*1.8)-rand(0,m.def));
    m.curHp-=dmg; p.mana-=15;
    log.push(`Магический удар! **${dmg}** урона`);
  }
  if (customId==='fight_inventory') {
    const allItems=getInventory(user.id);
    const battleItems=allItems.filter(i=>{
      const si=SHOP_ITEMS.find(s=>s.name===i.item);
      return si && si.effect!=='card';
    });
    if (allItems.length===0) {
      return interaction.reply({content:'Инвентарь пуст! Купи предметы в **/shop**.',ephemeral:true});
    }
    const effMap={hp:'HP',mana:'Мана',atk:'Атака',def:'Защита',xp:'Опыт'};
    const components=[];
    if (battleItems.length>0) {
      const selectMenu=new StringSelectMenuBuilder()
        .setCustomId('fight_use_item')
        .setPlaceholder('Выбери предмет для использования...')
        .addOptions(battleItems.map(i=>{
          const si=SHOP_ITEMS.find(s=>s.name===i.item);
          const [st,vl]=si.effect.split('+');
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${i.item}  x${i.qty}`)
            .setDescription(`Эффект: +${vl} ${effMap[st]||st}`)
            .setValue(i.item);
        }));
      components.push(new ActionRowBuilder().addComponents(selectMenu));
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const buf=await generateInventoryCard(allItems, p);
      const att=new AttachmentBuilder(buf,{name:'inv.png'});
      const embed=new EmbedBuilder()
        .setColor(0x8E44AD)
        .setTitle('Инвентарь')
        .setImage('attachment://inv.png')
        .setFooter({text: battleItems.length>0 ? 'Выбери предмет ниже' : 'Нет предметов для боя'})
        .setTimestamp();
      return interaction.editReply({ embeds:[embed], files:[att], components });
    } catch {
      return interaction.editReply({
        content: battleItems.length>0 ? 'Выбери предмет:' : 'Нет предметов для боя.',
        components
      });
    }
  }
  if (customId==='fight_potion') {
    const allItems=getInventory(user.id);
    const battleItems=allItems.filter(i=>{ const si=SHOP_ITEMS.find(s=>s.name===i.item); return si&&si.effect!=='card'; });
    if (battleItems.length===0) return interaction.reply({content:'🎒 Инвентарь пуст! Купи предметы в **/shop**.',ephemeral:true});
    const components=[];
    const selectMenu=new StringSelectMenuBuilder()
      .setCustomId('fight_use_item')
      .setPlaceholder('Выбери предмет...')
      .addOptions(battleItems.map(i=>{ const si=SHOP_ITEMS.find(s=>s.name===i.item); const [st,vl]=si.effect.split('+'); const effMap={hp:'HP',mana:'Мана',atk:'Атака',def:'Защита',xp:'Опыт'}; return new StringSelectMenuOptionBuilder().setLabel(`${i.item}  x${i.qty}`).setDescription(`Эффект: +${vl} ${effMap[st]||st}`).setValue(i.item); }));
    components.push(new ActionRowBuilder().addComponents(selectMenu));
    await interaction.deferReply({ephemeral:true});
    try {
      const buf=await generateInventoryCard(allItems,p), att=new AttachmentBuilder(buf,{name:'inv.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x8E44AD).setTitle('Инвентарь').setImage('attachment://inv.png').setFooter({text:'Выбери предмет ниже'}).setTimestamp()],files:[att],components});
    } catch { return interaction.editReply({content:'Выбери предмет:',components}); }
  }
  if (customId==='fight_flee') {
    const mName=battle.monster?.name||'врага';
    battles.delete(user.id); savePlayer(p);
    try { await interaction.deferUpdate(); } catch {
      try { await interaction.reply({content:`🏃 Ты сбежал от **${mName}**!`,ephemeral:true}); } catch {}
      return;
    }
    try {
      const { generateFleeCard } = require('../canvas/generators');
      const buf=await generateFleeCard(p,mName), att=new AttachmentBuilder(buf,{name:'flee.png'});
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x95A5A6).setTitle('Побег!').setImage('attachment://flee.png').setTimestamp()],files:[att],components:[]});
    } catch {
      try { return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x95A5A6).setTitle('Побег!').setDescription(`Ты сбежал от **${mName}**!`).setTimestamp()],components:[]}); } catch {}
    }
    return;
  }

  // ── Способности врага ──
  if (m.curHp > 0) {
    let mDmg = Math.max(1, m.atk - rand(0, effectiveDef));
    if (m.ability==='crit' && rand(1,100)<=20) {
      mDmg*=3; log.push(`**КРИТ** от ${m.name}! **${mDmg}** урона!`);
    } else {
      log.push(`${m.name} атакует! **${mDmg}** урона`);
    }
    p.hp-=mDmg;
    if (m.ability==='manasteal') { const stolen=Math.min(10,p.mana); p.mana-=stolen; if (stolen>0) log.push(`${m.name} крадёт **${stolen}** маны!`); }
    if (m.ability==='burn' && battle.burnTurns===0 && rand(1,100)<=60) { battle.burnTurns=2; battle.burnDmg=Math.round(p.max_hp*0.10); log.push(`${m.name} поджигает тебя! Горение 2 хода`); }
    if (m.ability==='curse' && battle.debuffTurns===0 && rand(1,100)<=50) { battle.debuffAtk=5; battle.debuffTurns=3; log.push(`${m.name} проклинает тебя! ATK-5 на 3 хода`); }
    if (m.ability==='regen') { m.curHp=Math.min(m.hp,m.curHp+8); log.push(`${m.name} регенерирует +8 HP`); }
    if (m.ability==='heal' && !m.healedOnce && m.curHp/m.hp < 0.5) { const heal=Math.round(m.hp*0.15); m.curHp=Math.min(m.hp,m.curHp+heal); m.healedOnce=true; log.push(`${m.name} исцеляет себя на **${heal}** HP!`); }
    if (m.ability==='flee' && m.curHp/m.hp < 0.2 && rand(1,100)<=50) {
      battles.delete(user.id); savePlayer(p);
      return interaction.update({embeds:[new EmbedBuilder().setColor(0x95A5A6).setTitle('Противник сбежал!').setDescription(`${m.name} убежал при низком HP. Никакой награды...`).setTimestamp()],components:[]});
    }
    if (m.ability==='freeze' && !(battle.freezeTurns>0) && rand(1,100)<=55) { battle.freezeTurns=2; battle.freezeAtkDebuff=8; battle.freezeDefDebuff=5; log.push(`${m.name} замораживает тебя! ❄️ ATK-8, DEF-5 на 2 хода`); }
    if (m.ability==='void' && rand(1,100)<=65) {
      const manaDrain=Math.min(20,p.mana); p.mana-=manaDrain;
      const voidDmg=Math.floor(manaDrain*1.5);
      if(voidDmg>0) { p.hp-=voidDmg; log.push(`${m.name} поглощает пустоту: -${manaDrain}🔮 маны → **${voidDmg}** урона!`); }
      else log.push(`${m.name} тянется к разуму, но ты устоял (мана = 0)`);
    }
  }

  // Горение
  if (battle.burnTurns>0) { p.hp-=battle.burnDmg; battle.burnTurns--; log.push(`Горение: **${battle.burnDmg}** урона (осталось ходов: ${battle.burnTurns})`); }
  // Заморозка — таймер
  if (battle.freezeTurns>0) { battle.freezeTurns--; if(battle.freezeTurns===0){ battle.freezeAtkDebuff=0; battle.freezeDefDebuff=0; log.push('❄️ Заморозка прошла!'); } }
  // Дебафф таймер (проклятие)
  if (battle.debuffTurns>0) { battle.debuffTurns--; if(battle.debuffTurns===0){battle.debuffAtk=0;log.push('Проклятие спало!');} }

  battle.turn++;

  // Победа
  if (m.curHp<=0) {
    const bonuses=getCardBonuses(p);
    const { PROFESSIONS: PROF } = require('../data/constants');
    const prof=PROF[p.profession||'']||null;
    const season=getSeasonalEvent();
    const baseGold=rand(m.gold[0],m.gold[1]);
    let goldMult=bonuses.goldMult;
    if(prof?.goldBonus) goldMult+=prof.goldBonus;
    if(season?.bonus==='gold') goldMult*=season.mult;
    const gold=Math.floor(baseGold*goldMult);
    const xp=m.xp;
    if(goldMult>1) log.push(`✨ Бонус: +${Math.round((goldMult-1)*100)}% золота → **${gold}🪙**`);
    if(p.profession==='Охотник'&&rand(1,100)<=25&&season?.bonus!=='drop') {
      const freeItem=SHOP_ITEMS[rand(0,SHOP_ITEMS.length-1)]; addItem(user.id,freeItem.name); log.push(`🏹 Охотник нашёл **${freeItem.name}**!`);
    } else if(season?.bonus==='drop'&&rand(1,100)<=40) {
      const freeItem=SHOP_ITEMS[rand(0,SHOP_ITEMS.length-1)]; addItem(user.id,freeItem.name); log.push(`☀️ Летний поход: найден **${freeItem.name}**!`);
    }
    p.gold+=gold; p.xp+=xp; p.wins++; p.kills_total=(p.kills_total||0)+1;
    p.gold_earned=(p.gold_earned||0)+gold;
    if (m.name==='Гоблин') p.kills_goblin=(p.kills_goblin||0)+1;
    if (m.name==='Скелет') p.kills_skeleton=(p.kills_skeleton||0)+1;
    if (m.name==='Тролль') p.kills_troll=(p.kills_troll||0)+1;
    if (m.name==='Дракон') p.kills_dragon=(p.kills_dragon||0)+1;
    if (p.hp<p.max_hp*0.1) { const a=unlockAchievement(user.id,'survive'); if(a) log.push(`🏆 Достижение: ${a.icon} ${a.name}!`); }
    if (gold>=130) { const a=unlockAchievement(user.id,'rich_kill'); if(a) log.push(`🏆 Достижение: ${a.icon} ${a.name}!`); }
    const items=getInventory(user.id);
    if (items.reduce((s,i)=>s+i.qty,0)>=5) { const a=unlockAchievement(user.id,'collector'); if(a) log.push(`🏆 Достижение: ${a.icon} ${a.name}!`); }
    const lvlMsgs=checkLevelUp(p);
    const qRow=db.prepare('SELECT * FROM quests WHERE player_id=?').get(user.id);
    if (qRow) db.prepare('UPDATE quests SET progress=progress+1 WHERE player_id=?').run(user.id);
    addWeeklyWin(user.id, gold);
    battles.delete(user.id); savePlayer(p);
    const {newOnes:newA,goldEarned:achGold,allDone}=checkAchievements(p);
    if (achGold>0) savePlayer(p);
    const achMsgs=newA.map(a=>`🏆 **Достижение**: ${a.icon} **${a.name}**! +${a.gold}🪙`);
    if (achGold>0) achMsgs.push(`💰 Итого за достижения: **+${achGold}🪙**`);
    if (allDone) achMsgs.push(`✨ **ВСЕ ДОСТИЖЕНИЯ ВЫПОЛНЕНЫ!** +3000🪙 · Титул: 🏆 Мастер Феникса`);

    // Случайное событие
    let event=null;
    if (rand(1,100)<=40) {
      const total=RANDOM_EVENTS.reduce((s,e)=>s+e.chance,0);
      let roll=rand(1,total), chosen=null;
      for (const e of RANDOM_EVENTS) { roll-=e.chance; if (roll<=0){chosen=e;break;} }
      if (chosen) {
        const v=rand(chosen.val[0]||0,chosen.val[1]||0);
        event={...chosen,v,resultDesc:chosen.desc.replace('{v}',v)};
        if (chosen.type==='gold') { p.gold+=v; p.gold_earned=(p.gold_earned||0)+v; }
        if (chosen.type==='xp') { p.xp+=v; checkLevelUp(p); }
        if (chosen.type==='hp') p.hp=Math.min(p.max_hp,p.hp+v);
        if (chosen.type==='item') {
          const freeItem=SHOP_ITEMS[rand(0,SHOP_ITEMS.length-2)];
          addItem(user.id,freeItem.name);
          event.resultDesc=`Получен предмет: **${freeItem.name}**! Проверь /inventory`;
        }
        if (chosen.type==='curse') p.attack=Math.max(1,p.attack-v);
        savePlayer(p);
      }
    }

    await interaction.deferUpdate();
    try {
      const buf=await generateResultCard(p,true,m,gold,xp,event), att=new AttachmentBuilder(buf,{name:'result.png'});
      const eventLine=event?`\n${event.title} — ${event.resultDesc}`:'';
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x2ECC71).setTitle(`Победа над ${m.name}!`).setDescription(log.map(l=>`> ${l}`).join('\n')+`\n\`${divider}\`\n+${gold} золота  +${xp} опыта${eventLine}\n${[...lvlMsgs,...achMsgs].join('\n')}`).setImage('attachment://result.png').setTimestamp()],files:[att],components:[]});
    } catch {
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x2ECC71).setTitle('Победа!').setDescription(`+${gold} золота  +${xp} XP`).setTimestamp()],components:[]});
    }
    autoDelete(interaction, 3*60*1000);
    return;
  }

  // Поражение — проверяем питомца Феникс
  if (p.hp<=0) {
    if (p.pet==='Феникс' && !battle.phoenixUsed) {
      battle.phoenixUsed=true;
      p.hp=Math.round(p.max_hp*0.3);
      log.push(`**Феникс воскрешает тебя!** HP восстановлен до ${p.hp}!`);
      savePlayer(p);
      const fightRow2=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fight_attack').setLabel('Атака').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('fight_magic').setLabel('Магия').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('fight_potion').setLabel('Зелье').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('fight_flee').setLabel('Бежать').setStyle(ButtonStyle.Secondary),
      );
      try {
        const buf=await generateBattleCard(p,battle), att=new AttachmentBuilder(buf,{name:'battle.png'});
        return interaction.update({embeds:[battleEmbed(p,battle,log).setImage('attachment://battle.png')],files:[att],components:[fightRow2]});
      } catch { try { return interaction.update({embeds:[battleEmbed(p,battle,log)],components:[fightRow2]}); } catch {} }
    }
    p.hp=1; p.losses++; battles.delete(user.id); savePlayer(p);
    await interaction.deferUpdate();
    try {
      const buf=await generateResultCard(p,false,m,0,0,null), att=new AttachmentBuilder(buf,{name:'result.png'});
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle(`Поражение от ${m.name}!`).setDescription(log.map(l=>`> ${l}`).join('\n')+`\n\`${divider}\`\nИспользуй **/rest** для восстановления.`).setImage('attachment://result.png').setTimestamp()],files:[att],components:[]});
    } catch {
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle('Поражение!').setTimestamp()],components:[]});
    }
    autoDelete(interaction, 3*60*1000);
    return;
  }

  savePlayer(p);
  const fightRow=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fight_attack').setLabel('⚔️ Атака').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('fight_magic').setLabel('🔮 Магия').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('fight_potion').setLabel('🧪 Зелье').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('fight_flee').setLabel('🏃 Бежать').setStyle(ButtonStyle.Secondary),
  );
  try {
    const buf=await generateBattleCard(p,battle), att=new AttachmentBuilder(buf,{name:'battle.png'});
    return interaction.update({embeds:[battleEmbed(p,battle,log).setImage('attachment://battle.png')],files:[att],components:[fightRow]});
  } catch {
    try { return interaction.update({embeds:[battleEmbed(p,battle,log)],components:[fightRow]}); } catch {}
  }
}

module.exports = { handleBtn };
