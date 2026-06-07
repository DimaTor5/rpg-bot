'use strict';
require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

const { handleAutocomplete } = require('./src/handlers/autocomplete');
const { handleCmd } = require('./src/handlers/commands');
const { handleBtn } = require('./src/handlers/buttons');
const { handleSelect } = require('./src/handlers/select');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// ══════════════════════════════════════════════════════════════
//  SLASH КОМАНДЫ
// ══════════════════════════════════════════════════════════════
const commands = [
  new SlashCommandBuilder().setName('start').setDescription('Начать приключение').addStringOption(o=>o.setName('класс').setDescription('Класс').setRequired(true).addChoices({name:'⚔️ Воин',value:'Воин'},{name:'🧙 Маг',value:'Маг'},{name:'🏹 Лучник',value:'Лучник'},{name:'🛡️ Паладин',value:'Паладин'})),
  new SlashCommandBuilder().setName('profile').setDescription('Профиль'),
  new SlashCommandBuilder().setName('fight').setDescription('Сразиться с врагом'),
  new SlashCommandBuilder().setName('inventory').setDescription('Инвентарь'),
  new SlashCommandBuilder().setName('shop').setDescription('Магазин'),
  new SlashCommandBuilder().setName('quest').setDescription('Квест'),
  new SlashCommandBuilder().setName('daily').setDescription('Ежедневная награда'),
  new SlashCommandBuilder().setName('top').setDescription('Топ игроков'),
  new SlashCommandBuilder().setName('rest').setDescription('Отдохнуть (20🪙)'),
  new SlashCommandBuilder().setName('achievements').setDescription('Достижения'),
  new SlashCommandBuilder().setName('location').setDescription('Сменить локацию').addStringOption(o=>o.setName('место').setDescription('Локация').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('duel').setDescription('Вызвать игрока на дуэль').addUserOption(o=>o.setName('игрок').setDescription('Противник').setRequired(true)),
  new SlashCommandBuilder().setName('gamble').setDescription('Казино').addStringOption(o=>o.setName('игра').setDescription('Игра').setRequired(true).addChoices({name:'🎲 Кости',value:'dice'},{name:'🃏 Блэкджек',value:'blackjack'})).addIntegerOption(o=>o.setName('ставка').setDescription('Сумма').setRequired(true).setMinValue(10)),
  new SlashCommandBuilder().setName('customize').setDescription('Изменить расу').addStringOption(o=>o.setName('раса').setDescription('Раса').setRequired(true).addChoices({name:'👤 Человек',value:'Человек'},{name:'🧝 Эльф',value:'Эльф'},{name:'👹 Орк',value:'Орк'},{name:'⛏️ Дварф',value:'Дварф'})),
  new SlashCommandBuilder().setName('use').setDescription('Использовать предмет').addStringOption(o=>o.setName('предмет').setDescription('Название').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('drop').setDescription('Выбросить предмет из инвентаря').addStringOption(o=>o.setName('предмет').setDescription('Название предмета').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('sell').setDescription('Продать карту за 40% цены').addStringOption(o=>o.setName('карта').setDescription('Название карты').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('market').setDescription('Рынок игроков — купи или выстави предмет')
    .addStringOption(o=>o.setName('предмет').setDescription('Предмет для продажи (карта или снаряжение)').setRequired(false).setAutocomplete(true))
    .addIntegerOption(o=>o.setName('цена').setDescription('Цена в золоте').setMinValue(1).setRequired(false)),
  new SlashCommandBuilder().setName('trade').setDescription('Обменять карту с игроком').addUserOption(o=>o.setName('игрок').setDescription('Кому отдать').setRequired(true)).addStringOption(o=>o.setName('карта').setDescription('Название карты').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('help').setDescription('Все команды бота'),
  new SlashCommandBuilder().setName('stats').setDescription('Детальная статистика'),
  new SlashCommandBuilder().setName('weekly').setDescription('Недельный рейтинг'),
  new SlashCommandBuilder().setName('pet').setDescription('Питомцы').addStringOption(o=>o.setName('питомец').setDescription('Выбери питомца').addChoices(
    {name:'Волк (ATK+5) 300г',value:'Волк'},{name:'Фея (DEF+4 MANA+20) 500г',value:'Фея'},
    {name:'Медведь (HP+40 DEF+2) 600г',value:'Медведь'},{name:'Феникс (воскрешение) 800г',value:'Феникс'},
    {name:'Дракон (ATK+8 DEF+3) 1200г',value:'Дракон'})),
  new SlashCommandBuilder().setName('guild').setDescription('Гильдия').addStringOption(o=>o.setName('действие').setDescription('Что сделать').setRequired(true).addChoices(
    {name:'Создать',value:'create'},{name:'Вступить',value:'join'},{name:'Инфо',value:'info'},
    {name:'Покинуть',value:'leave'},{name:'Пополнить казну',value:'donate'}))
    .addStringOption(o=>o.setName('аргумент').setDescription('Название / сумма')),
  new SlashCommandBuilder().setName('explore').setDescription('Исследовать текущую локацию (сундуки, ловушки, торговцы)'),
  new SlashCommandBuilder().setName('upgrade').setDescription('Улучшить снаряжение за золото').addStringOption(o=>o.setName('предмет').setDescription('Название предмета').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('profession').setDescription('Выбрать профессию').addStringOption(o=>o.setName('профессия').setDescription('Название профессии').setRequired(false).setAutocomplete(true)),
  new SlashCommandBuilder().setName('card').setDescription('Твоя банковская карта — баланс и тир'),
  new SlashCommandBuilder().setName('deposit').setDescription('Положить золото на карту').addIntegerOption(o=>o.setName('сумма').setDescription('Сколько золота положить').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('withdraw').setDescription('Снять золото с карты').addIntegerOption(o=>o.setName('сумма').setDescription('Сколько снять').setRequired(true).setMinValue(1)),
].map(c => c.toJSON());

// ══════════════════════════════════════════════════════════════
//  КЛИЕНТ
// ══════════════════════════════════════════════════════════════
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`RPG Бот запущен: ${client.user.tag}`);
  // Пробуем установить аватар
  try {
    const r = await axios.get('https://api.dicebear.com/9.x/adventurer/png?seed=DimychWarrior&size=256', { responseType: 'arraybuffer', timeout: 8000 });
    await client.user.setAvatar(Buffer.from(r.data));
    console.log('Аватар установлен');
  } catch (e) { console.log('Аватар пропущен:', e.message); }
  // Регистрируем слэш-команды
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('Команды зарегистрированы');
});

client.on('interactionCreate', async i => {
  if (i.isChatInputCommand())  return handleCmd(i).catch(e => console.error(e));
  if (i.isButton())            return handleBtn(i).catch(e => console.error(e));
  if (i.isStringSelectMenu())  return handleSelect(i).catch(e => console.error(e));
  if (i.isAutocomplete())      return handleAutocomplete(i).catch(e => console.error(e));
});

client.login(TOKEN);
