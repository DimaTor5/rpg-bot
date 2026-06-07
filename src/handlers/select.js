'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const { SHOP_ITEMS, rand } = require('../data/constants');
const { getPlayer, savePlayer, checkLevelUp, getInventory, useItem } = require('../db/queries');
const { generateBattleCard, generateInventoryCard } = require('../canvas/generators');
const { battles, processingInteractions } = require('../state');
const { battleEmbed } = require('./commands');

async function handleSelect(interaction) {
  if (processingInteractions.has(interaction.id)) {
    try { await interaction.deferUpdate(); } catch {}
    return;
  }
  processingInteractions.add(interaction.id);
  setTimeout(() => processingInteractions.delete(interaction.id), 10_000);
  const { customId, user, values } = interaction;

  if (customId === 'fight_use_item') {
    const itemName = values[0];
    const p = getPlayer(user.id, user.username);
    const battle = battles.get(user.id);

    if (!battle) {
      return interaction.update({ content: 'Бой уже закончен!', components: [] });
    }

    const shopItem = SHOP_ITEMS.find(i => i.name === itemName);
    if (!shopItem || !useItem(user.id, itemName)) {
      return interaction.update({ content: 'Предмет не найден или закончился.', components: [] });
    }

    // Применяем эффект
    const [stat, val] = shopItem.effect.split('+');
    const amount = parseInt(val);
    let effectMsg = '';
    if (stat === 'hp')   { p.hp   = Math.min(p.max_hp,   p.hp   + amount); effectMsg = `+${amount} HP`; }
    if (stat === 'mana') { p.mana = Math.min(p.max_mana, p.mana + amount); effectMsg = `+${amount} маны`; }
    if (stat === 'atk')  { p.attack  += amount;                             effectMsg = `+${amount} к атаке`; }
    if (stat === 'def')  { p.defense += amount;                             effectMsg = `+${amount} к защите`; }
    if (stat === 'xp')   { p.xp += amount; checkLevelUp(p);                effectMsg = `+${amount} XP`; }
    savePlayer(p);

    // Убираем меню и показываем результат
    await interaction.update({ content: `Использован **${itemName}**: ${effectMsg}`, components: [] });

    // Ответный удар монстра
    const m = battle.monster;
    const log = [`Использован ${itemName}: ${effectMsg}`];
    if (m.curHp > 0) {
      const mDmg = Math.max(1, m.atk - rand(0, p.defense));
      p.hp -= mDmg;
      log.push(`${m.name} контратакует! **${mDmg}** урона`);
      savePlayer(p);
    }
    battle.turn++;

    if (p.hp <= 0) {
      p.hp = 1; p.losses++; battles.delete(user.id); savePlayer(p);
      return;
    }

    const fightRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fight_attack').setLabel('Атака').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('fight_magic').setLabel('Магия').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('fight_inventory').setLabel('Инвентарь').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('fight_flee').setLabel('Бежать').setStyle(ButtonStyle.Secondary),
    );

    try {
      const buf = await generateBattleCard(p, battle), att = new AttachmentBuilder(buf, { name: 'battle.png' });
      await interaction.followUp({
        embeds: [battleEmbed(p, battle, log).setImage('attachment://battle.png')],
        files: [att], components: [fightRow],
      });
    } catch {
      await interaction.followUp({ embeds: [battleEmbed(p, battle, log)], components: [fightRow] });
    }
  }
}

module.exports = { handleSelect };
