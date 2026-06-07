'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const {
  CLASSES, SHOP_ITEMS, CARD_SHOP_ITEMS, CARD_TIERS, PROFESSIONS, PETS, RANDOM_EVENTS,
  rand, getCardBonuses, getSeasonalEvent,
} = require('../data/constants');
const {
  db, getPlayer, savePlayer, checkLevelUp, getInventory, addItem, useItem,
  addWeeklyWin, checkAchievements, unlockAchievement, getUpgradeLevel, setUpgradeLevel,
} = require('../db/queries');
const {
  generateBattleCard, generateResultCard, generateRestCard, generateInventoryCard,
  generateUpgradeCard, generateProfessionCard, generatePetShopCard, generateMarketCard,
} = require('../canvas/generators');
const {
  battles, pvpBattles, pendingDuels, pendingTrades, processingInteractions,
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
    checkAchievements(p);
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
      checkAchievements(att);
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
    const newA=checkAchievements(p);
    const achMsgs=newA.map(a=>`🏆 **Достижение**: ${a.icon} **${a.name}**!`);

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
