'use strict';
const { PROFESSIONS, LOCATIONS } = require('../data/constants');
const { getInventory, getPlayer } = require('../db/queries');

async function handleAutocomplete(interaction) {
  const { commandName, user } = interaction;
  const focused = interaction.options.getFocused().toLowerCase();

  // Инвентарь игрока для команд с предметами
  const invCmds = ['upgrade','drop','sell','trade','market'];
  if (invCmds.includes(commandName)) {
    const inv = getInventory(user.id);
    const items = inv
      .filter(i => i.item.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(i => ({ name: `${i.item}${i.qty>1?` ×${i.qty}`:''}`, value: i.item }));
    return interaction.respond(items);
  }

  if (commandName === 'use') {
    const inv = getInventory(user.id);
    const items = inv
      .filter(i => i.item.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(i => ({ name: `${i.item}${i.qty>1?` ×${i.qty}`:''}`, value: i.item }));
    return interaction.respond(items);
  }

  if (commandName === 'profession') {
    const choices = Object.entries(PROFESSIONS)
      .filter(([name]) => name.toLowerCase().includes(focused))
      .map(([name, prof]) => ({ name: `${prof.emoji} ${name} — ${prof.desc.slice(0,40)}`, value: name }));
    return interaction.respond(choices);
  }

  if (commandName === 'location') {
    const p = getPlayer(user.id, user.username);
    const choices = Object.entries(LOCATIONS)
      .filter(([name]) => name.toLowerCase().includes(focused) && LOCATIONS[name].minLvl <= p.level)
      .map(([name, loc]) => ({ name: `${loc.emoji} ${name} (ур.${loc.minLvl}+)`, value: name }));
    return interaction.respond(choices);
  }

  await interaction.respond([]);
}

module.exports = { handleAutocomplete };
