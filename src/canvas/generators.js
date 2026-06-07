'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { roundRect, drawMixed, drawIcon, drawBar, fetchAvatarCached, drawAvatar, cardBase } = require('./helpers');
const {
  CLASSES, RACES, LOCATIONS, MONSTERS, ABILITIES,
  SHOP_ITEMS, CARD_SHOP_ITEMS, CARD_TIERS,
  PROFESSIONS, PETS, ACHIEVEMENTS_LIST,
  XP_PER_LEVEL, getActiveTier,
} = require('../data/constants');

// ──────────────────────────────────────────────────────────────
//  БАНКОВСКАЯ КАРТА (визуальная)
// ──────────────────────────────────────────────────────────────
async function generateBankCard(p) {
  const CARD_H=280, STATS_H=80, GAP=10;
  const W=460, H=CARD_H+GAP+STATS_H;
  const canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const tier = getActiveTier(p) || CARD_TIERS[0];
  const nextCard = CARD_SHOP_ITEMS.find(c => c.tierId === (CARD_TIERS[tier.rank]||{}).id) || null;

  // ── Фон карты ──
  const bg = ctx.createLinearGradient(0, 0, W, CARD_H);
  bg.addColorStop(0, tier.grad[0]);
  bg.addColorStop(1, tier.grad[1]);
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, CARD_H, 18); ctx.fill();

  // ── Большой декоративный круг справа ──
  const circle = ctx.createRadialGradient(W*0.82, H*0.28, 10, W*0.82, H*0.28, 170);
  circle.addColorStop(0, tier.accent+'35');
  circle.addColorStop(0.5, tier.accent+'18');
  circle.addColorStop(1, 'transparent');
  ctx.fillStyle = circle;
  ctx.beginPath(); ctx.arc(W*0.82, H*0.28, 170, 0, Math.PI*2); ctx.fill();

  // ── Архаловская: радужное свечение ──
  if (tier.id === 'arkhal') {
    const colors = ['#ea80fc22','#80d8ff18','#ccff9018'];
    for (let i=0;i<3;i++) {
      const g = ctx.createRadialGradient(W*(0.2+i*0.3),H*0.5,5,W*(0.2+i*0.3),H*0.5,130);
      g.addColorStop(0, colors[i]); g.addColorStop(1,'transparent');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }
  }

  // ── Глянцевый блик ──
  const shine = ctx.createLinearGradient(0,0,0,H*0.45);
  shine.addColorStop(0,'rgba(255,255,255,0.10)');
  shine.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=shine; roundRect(ctx,0,0,W,H*0.45,18); ctx.fill();

  // ── Рамка ──
  ctx.strokeStyle = tier.accent+'70'; ctx.lineWidth=1.5;
  roundRect(ctx,1,1,W-2,H-2,17); ctx.stroke();

  // ── Заголовок: NearChat RPG (слева) + ТИР CARD (справа) ──
  ctx.fillStyle = tier.accent+'cc'; ctx.font='bold 14px sans-serif'; ctx.textAlign='left';
  ctx.fillText('Феникс RPG', 22, 34);
  ctx.textAlign='right'; ctx.fillStyle=tier.accent+'99'; ctx.font='bold 12px sans-serif';
  ctx.fillText(`${tier.name.toUpperCase()} CARD`, W-22, 34);

  // ── Разделитель ──
  ctx.strokeStyle=tier.accent+'25'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(22,42); ctx.lineTo(W-22,42); ctx.stroke();

  // ── Чип ──
  const CX=22, CY=58, CW=48, CH=36;
  const chipG=ctx.createLinearGradient(CX,CY,CX+CW,CY+CH);
  chipG.addColorStop(0,tier.chip+'ee'); chipG.addColorStop(1,tier.chip+'88');
  ctx.fillStyle=chipG; roundRect(ctx,CX,CY,CW,CH,5); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(CX+CW/3,CY); ctx.lineTo(CX+CW/3,CY+CH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX+CW*2/3,CY); ctx.lineTo(CX+CW*2/3,CY+CH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX,CY+CH/2); ctx.lineTo(CX+CW,CY+CH/2); ctx.stroke();

  // ── Бесконтактный значок ──
  ctx.strokeStyle=tier.accent+'bb'; ctx.lineWidth=1.8;
  for (let i=0;i<3;i++) {
    ctx.beginPath();
    ctx.arc(CX+CW+12, CY+CH/2, 7+i*8, -Math.PI*0.55, Math.PI*0.55);
    ctx.stroke();
  }

  // ── Номер карты: **** **** **** XXXX ──
  const lastFour = String(p.id||'0000').slice(-4).padStart(4,'0');
  ctx.fillStyle=tier.text; ctx.font='bold 20px monospace'; ctx.textAlign='left';
  ctx.letterSpacing='2px';
  ctx.fillText(`**** **** **** ${lastFour}`, 22, 138);

  // ── Владелец + Уровень ──
  ctx.fillStyle=tier.accent+'77'; ctx.font='10px sans-serif';
  ctx.fillText('ВЛАДЕЛЕЦ КАРТЫ', 22, 162);
  ctx.fillText('УРОВЕНЬ', 230, 162);
  ctx.fillStyle=tier.text; ctx.font='bold 13px sans-serif';
  ctx.fillText(p.name.toUpperCase(), 22, 178);
  ctx.fillText(`${p.level} LVL`, 230, 178);

  // ── Баланс золота ──
  ctx.fillStyle=tier.accent+'77'; ctx.font='10px sans-serif';
  ctx.fillText('БАЛАНС ЗОЛОТА', 22, 208);
  ctx.fillStyle=tier.text; ctx.font='bold 22px sans-serif';
  ctx.fillText(`${(p.card_gold||0).toLocaleString('ru')}`, 22, 230);

  // ── Монета справа снизу ──
  ctx.font='26px sans-serif'; ctx.textAlign='right';
  ctx.fillText('🪙', W-22, H-18);

  // ══ STATS ПАНЕЛЬ ══
  const SY = CARD_H + GAP;

  // Фон панели
  const statsBg = ctx.createLinearGradient(0, SY, 0, SY+STATS_H);
  statsBg.addColorStop(0, '#111111');
  statsBg.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = statsBg;
  roundRect(ctx, 0, SY, W, STATS_H, 12); ctx.fill();
  ctx.strokeStyle = tier.accent+'55'; ctx.lineWidth=1;
  roundRect(ctx, 0, SY, W, STATS_H, 12); ctx.stroke();

  // Три блока: Баланс | Кошелёк | Тир
  const blocks = [
    { label:'💰 БАЛАНС',  value:`${(p.card_gold||0).toLocaleString('ru')} 🪙`, color: tier.accent },
    { label:'👛 КОШЕЛЁК', value:`${(p.gold||0).toLocaleString('ru')} 🪙`,      color: '#e0e0e0'  },
    { label:'🏅 ТИР',     value:`${'★'.repeat(tier.rank)}  ${tier.rank}/7`,    color: tier.accent },
  ];
  const BW = W / blocks.length;
  blocks.forEach((b, i) => {
    const bx = i * BW;
    // Разделитель
    if (i > 0) {
      ctx.strokeStyle = tier.accent+'25'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(bx, SY+10); ctx.lineTo(bx, SY+STATS_H-10); ctx.stroke();
    }
    ctx.fillStyle = '#888'; ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(b.label, bx+BW/2, SY+18);
    ctx.fillStyle = b.color; ctx.font='bold 14px sans-serif';
    ctx.fillText(b.value, bx+BW/2, SY+40);
  });

  // Привилегии карты
  ctx.strokeStyle = tier.accent+'20'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(16, SY+52); ctx.lineTo(W-16, SY+52); ctx.stroke();
  ctx.fillStyle = tier.accent+'cc'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
  ctx.fillText(`⚡ ${tier.perkDesc}`, W/2, SY+65);

  // Подсказка снизу
  if (nextCard) {
    ctx.fillStyle='#444'; ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(`Следующая: ${nextCard.emoji} ${nextCard.name} — ${nextCard.price.toLocaleString('ru')}🪙`, W/2, SY+STATS_H-6);
  } else {
    ctx.fillStyle=tier.accent+'77'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center';
    ctx.fillText('✨ МАКСИМАЛЬНЫЙ ТИР', W/2, SY+STATS_H-6);
  }

  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ПРОФИЛЯ
// ──────────────────────────────────────────────────────────────
async function generateProfileCard(p) {
  const W=520, H=280, canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const cls=CLASSES[p.class]||CLASSES['Воин'], accent=cls.accent;
  cardBase(ctx,W,H,'#0d0d0d',cls.bg,accent);
  const AX=30, AY=H/2, AR=75;
  try { const img=await fetchAvatarCached(p.name+p.class+(p.race||'')); drawAvatar(ctx,img,AX+AR,AY,AR,accent); } catch {}
  ctx.fillStyle=accent; ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
  ctx.fillText(`УР.${p.level}`, AX+AR*2, AY+AR-1);
  const lvlBg=ctx.createLinearGradient(AX+AR-22,AY+AR-16,AX+AR*2+22,AY+AR+6);
  lvlBg.addColorStop(0,accent); lvlBg.addColorStop(1,accent+'cc');
  ctx.fillStyle=lvlBg; roundRect(ctx,AX+AR*2-22,AY+AR-16,44,22,11); ctx.fill();
  ctx.fillStyle='#000'; ctx.fillText(`УР.${p.level}`,AX+AR*2,AY+AR-1);
  const RX=AX*2+AR*2+10;
  const lg=ctx.createLinearGradient(RX,20,RX,H-20);
  lg.addColorStop(0,'transparent'); lg.addColorStop(.5,accent+'80'); lg.addColorStop(1,'transparent');
  ctx.strokeStyle=lg; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(RX,20); ctx.lineTo(RX,H-20); ctx.stroke();
  const PX=RX+18;
  ctx.fillStyle='#fff'; ctx.font='bold 26px sans-serif'; ctx.textAlign='left';
  ctx.fillText(p.name, PX, 52);
  const race=RACES[p.race]||RACES['Человек'];
  const tags=[{t:`${p.class}`,c:accent},{t:`${p.race||'Человек'}`,c:'#aaa'}];
  let tx=PX;
  for (const tag of tags) {
    ctx.font='bold 12px sans-serif';
    const tw=ctx.measureText(tag.t).width+16;
    ctx.fillStyle=tag.c+'30'; roundRect(ctx,tx,58,tw,20,5); ctx.fill();
    ctx.fillStyle=tag.c; ctx.fillText(tag.t,tx+8,72); tx+=tw+8;
  }
  const BW=W-PX-20;
  drawBar(ctx,PX,100,BW,p.hp,p.max_hp,'#e74c3c','HP','hp');
  drawBar(ctx,PX,132,BW,p.mana,p.max_mana,'#3498db','МАНА','mana');
  const xpN=XP_PER_LEVEL(p.level);
  drawBar(ctx,PX,164,BW,Math.min(p.xp,xpN),xpN,'#f1c40f','ОПЫТ','xp');
  const wr=p.wins+p.losses>0?Math.round(p.wins/(p.wins+p.losses)*100):0;
  const stats=[
    {icon:'atk', l:'АТАКА',   v:p.attack},
    {icon:'def', l:'ЗАЩИТА',  v:p.defense},
    {icon:'gold',l:'ЗОЛОТО',  v:p.gold},
    {icon:'xp',  l:`${wr}% ПОБ`, v:p.wins},
  ];
  const SW=BW/stats.length;
  stats.forEach((s,i)=>{
    const sx=PX+i*SW, cx=sx+SW/2-3;
    ctx.fillStyle='#ffffff10'; roundRect(ctx,sx,210,SW-6,52,8); ctx.fill();
    ctx.strokeStyle=accent+'30'; ctx.lineWidth=1; roundRect(ctx,sx,210,SW-6,52,8); ctx.stroke();
    // Иконка
    drawIcon(ctx,s.icon,cx,222,10);
    // Значение
    ctx.fillStyle=accent; ctx.font='bold 16px sans-serif'; ctx.textAlign='center';
    ctx.fillText(String(s.v),cx,240);
    // Подпись
    ctx.fillStyle='#666'; ctx.font='10px sans-serif'; ctx.fillText(s.l,cx,254);
    ctx.textAlign='left';
  });
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА БОЯ
// ──────────────────────────────────────────────────────────────
async function generateBattleCard(p, battle) {
  const W=520,H=240,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  const m=battle.monster, cls=CLASSES[p.class]||CLASSES['Воин'];
  const bg=ctx.createLinearGradient(0,0,W,0);
  bg.addColorStop(0,cls.bg); bg.addColorStop(.5,'#0d0d0d'); bg.addColorStop(1,m.bg||'#1a0000');
  ctx.fillStyle=bg; roundRect(ctx,0,0,W,H,14); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.03)'; ctx.font='bold 80px sans-serif'; ctx.textAlign='center';
  ctx.fillText('VS',W/2,H/2+30);
  ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1; roundRect(ctx,1,1,W-2,H-2,13); ctx.stroke();
  const ll=ctx.createLinearGradient(W/2,0,W/2,H);
  ll.addColorStop(0,'transparent'); ll.addColorStop(.3,cls.accent+'80'); ll.addColorStop(.5,'#ffffff80');
  ll.addColorStop(.7,(m.accent||'#e74c3c')+'80'); ll.addColorStop(1,'transparent');
  ctx.strokeStyle=ll; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(W/2,10); ctx.lineTo(W/2,H-10); ctx.stroke();

  const drawSide = async (cx,name,curHp,maxHp,atk,def,seed,accent,isMonster) => {
    const AR=62;
    try {
      const style=isMonster?'pixel-art-neutral':'adventurer';
      const img=await fetchAvatarCached(seed,style);
      drawAvatar(ctx,img,cx,95,AR,accent);
    } catch {}
    const bw=140,bx=cx-bw/2;
    ctx.fillStyle='#1a1a1a'; roundRect(ctx,bx,168,bw,12,6); ctx.fill();
    const pct=Math.max(0,curHp/maxHp);
    const bc=pct>.5?'#2ecc71':pct>.25?'#f1c40f':'#e74c3c';
    ctx.fillStyle=bc; roundRect(ctx,bx,168,Math.max(12,bw*pct),12,6); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
    ctx.fillText(name,cx,158);
    ctx.fillStyle='#aaa'; ctx.font='11px sans-serif';
    ctx.fillText(`HP ${curHp}/${maxHp}`,cx,190);
    ctx.fillStyle=accent;
    drawMixed(ctx,`{atk}${atk}  {def}${def}`,cx-20,208,9);
    ctx.textAlign='left';
  };
  await drawSide(W*.25,p.name,p.hp,p.max_hp,p.attack,p.defense,p.name+p.class,cls.accent,false);
  await drawSide(W*.75,m.name,m.curHp,m.hp,m.atk,m.def,m.seed||m.name,m.accent||'#e74c3c',true);
  ctx.fillStyle='#fff'; ctx.font='bold 18px sans-serif'; ctx.textAlign='center';
  ctx.fillText('VS',W/2,108); ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА РЕЗУЛЬТАТА БОЯ
// ──────────────────────────────────────────────────────────────
async function generateResultCard(p, won, monster, goldGain, xpGain, event) {
  const W=480,H=220,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  const accent=won?'#2ecc71':'#e74c3c';
  cardBase(ctx,W,H,'#0d0d0d',won?'#0a1a05':'#1a0505',accent);
  const AR=65;
  try {
    const img=await fetchAvatarCached(won?p.name+p.class:monster.seed||monster.name, won?'adventurer':'pixel-art-neutral');
    drawAvatar(ctx,img,AR+20,H/2,AR,accent);
  } catch {}
  const PX=AR*2+40;
  ctx.fillStyle=accent; ctx.font='bold 28px sans-serif';
  ctx.fillText(won?'ПОБЕДА!':'ПОРАЖЕНИЕ', PX, 50);
  ctx.fillStyle='#aaa'; ctx.font='14px sans-serif';
  ctx.fillText(`${won?'Побеждён':'Победил'}: ${monster.name}`, PX, 74);
  const line=ctx.createLinearGradient(PX,80,W-20,80);
  line.addColorStop(0,accent+'80'); line.addColorStop(1,'transparent');
  ctx.strokeStyle=line; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,82); ctx.lineTo(W-20,82); ctx.stroke();
  if (won) {
    ctx.fillStyle='#f1c40f'; ctx.font='bold 15px sans-serif';
    drawMixed(ctx,`{gold} +${goldGain} золота`, PX, 106, 11);
    ctx.fillStyle='#a29bfe'; drawMixed(ctx,`{xp} +${xpGain} опыта`, PX+155, 106, 11);
    if (event) {
      ctx.fillStyle=event.type==='curse'?'#e74c3c':'#00cec9';
      ctx.fillText(`${event.emoji} ${event.title}`, PX, 130);
      ctx.fillStyle='#aaa'; ctx.font='13px sans-serif';
      ctx.fillText(event.resultDesc, PX, 148);
    }
  }
  const BW=W-PX-20;
  drawBar(ctx,PX,won?155:100,BW,p.hp,p.max_hp,'#e74c3c','HP','hp');
  if (!won) { ctx.fillStyle='#888'; ctx.font='13px sans-serif'; ctx.fillText('Используй /rest для восстановления',PX,135); }
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА МАГАЗИНА
// ──────────────────────────────────────────────────────────────
async function generateShopCard(playerGold, discount=0) {
  const COLS=2,CW=220,CH=90,PAD=14;
  const ROWS=Math.ceil(SHOP_ITEMS.length/COLS);
  const W=COLS*CW+(COLS+1)*PAD, H=ROWS*CH+(ROWS+1)*PAD+70+(discount>0?28:0);
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0a00','#1a1200','#f39c12',16);
  ctx.fillStyle='#f39c12'; ctx.font='bold 20px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Магазин Приключений',W/2,38);
  if (discount>0) {
    ctx.fillStyle='#2ecc71'; ctx.font='bold 12px sans-serif';
    ctx.fillText(`💳 Скидка ${Math.round(discount*100)}% по карте активна!`,W/2,56);
  }
  ctx.strokeStyle='#f39c1240'; ctx.lineWidth=1;
  const divY = discount>0 ? 64 : 48;
  ctx.beginPath(); ctx.moveTo(PAD,divY); ctx.lineTo(W-PAD,divY); ctx.stroke();
  ctx.textAlign='left';
  const itemOffY = discount>0 ? 8 : 0;
  SHOP_ITEMS.forEach((item,i)=>{
    const col=i%COLS, row=Math.floor(i/COLS);
    const x=PAD+col*(CW+PAD), y=56+PAD+row*(CH+PAD)+itemOffY;
    ctx.fillStyle='#ffffff08'; roundRect(ctx,x,y,CW,CH,10); ctx.fill();
    ctx.strokeStyle='#f39c1235'; ctx.lineWidth=1; roundRect(ctx,x,y,CW,CH,10); ctx.stroke();
    ctx.fillStyle='#f39c12'; roundRect(ctx,x,y+10,3,CH-20,2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 15px sans-serif'; ctx.fillText(item.name,x+12,y+28);
    if (discount>0) {
      const finalPrice=Math.floor(item.price*(1-discount));
      // Зачёркнутая старая цена
      ctx.fillStyle='#666'; ctx.font='11px sans-serif';
      const oldText=`${item.price}🪙`;
      ctx.fillText(oldText,x+12,y+50);
      const oldW=ctx.measureText(oldText).width;
      ctx.strokeStyle='#e74c3c'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x+12,y+45); ctx.lineTo(x+12+oldW,y+45); ctx.stroke();
      // Новая цена
      ctx.fillStyle='#2ecc71'; ctx.font='bold 13px sans-serif';
      drawMixed(ctx,`{gold} ${finalPrice} золота`,x+12+oldW+8,y+50,10);
    } else {
      ctx.fillStyle='#f1c40f'; ctx.font='bold 13px sans-serif';
      drawMixed(ctx,`{gold} ${item.price} золота`,x+12,y+50,10);
    }
    ctx.fillStyle='#888'; ctx.font='11px sans-serif';
    const effMap={hp:'HP',mana:'МАНА',atk:'АТК',def:'ДЕФ',xp:'XP'};
    const eff=item.effect.replace(/(\w+)\+(\d+)/,(_,s,v)=>`+${v} ${effMap[s]||s}`);
    ctx.fillText(`+ ${eff}`,x+12,y+70);
  });
  ctx.fillStyle='#f39c1240'; roundRect(ctx,PAD,H-44,W-PAD*2,34,8); ctx.fill();
  ctx.fillStyle='#f1c40f'; ctx.font='bold 14px sans-serif';
  const tw=ctx.measureText(`У тебя: ${playerGold} золота`).width;
  const bx=(W-tw-16)/2;
  drawMixed(ctx,`{gold} У тебя: ${playerGold} золота`,bx,H-22,11);
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  МАГИЧЕСКАЯ ЗОЛОТАЯ КАРТОЧКА
// ──────────────────────────────────────────────────────────────
async function generateGoldCard(p) {
  const W=430, H=270, canvas=createCanvas(W,H), ctx=canvas.getContext('2d');

  // Фон карты — золотой градиент
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#1a1200');
  bg.addColorStop(0.4,'#2d2000');
  bg.addColorStop(1,'#1a1200');
  ctx.fillStyle=bg; roundRect(ctx,0,0,W,H,18); ctx.fill();

  // Блеск сверху-слева
  const shine=ctx.createRadialGradient(80,60,10,80,60,200);
  shine.addColorStop(0,'rgba(255,215,0,0.18)');
  shine.addColorStop(0.5,'rgba(255,180,0,0.08)');
  shine.addColorStop(1,'transparent');
  ctx.fillStyle=shine; ctx.fillRect(0,0,W,H);

  // Блеск снизу-справа
  const shine2=ctx.createRadialGradient(W-60,H-50,10,W-60,H-50,180);
  shine2.addColorStop(0,'rgba(255,215,0,0.12)');
  shine2.addColorStop(1,'transparent');
  ctx.fillStyle=shine2; ctx.fillRect(0,0,W,H);

  // Рамка золотая
  const border=ctx.createLinearGradient(0,0,W,H);
  border.addColorStop(0,'#f1c40f');
  border.addColorStop(0.5,'#f39c12');
  border.addColorStop(1,'#e67e22');
  ctx.strokeStyle=border; ctx.lineWidth=2.5;
  roundRect(ctx,1,1,W-2,H-2,17); ctx.stroke();

  // Внутренняя тонкая рамка
  ctx.strokeStyle='rgba(255,215,0,0.2)'; ctx.lineWidth=1;
  roundRect(ctx,7,7,W-14,H-14,14); ctx.stroke();

  // Декоративные круги (как Mastercard)
  ctx.globalAlpha=0.12;
  ctx.fillStyle='#f1c40f';
  ctx.beginPath(); ctx.arc(W-80,50,55,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W-45,50,55,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;

  // Тонкая горизонтальная полоса сверху
  const stripe=ctx.createLinearGradient(0,38,W,38);
  stripe.addColorStop(0,'transparent');
  stripe.addColorStop(0.3,'rgba(255,215,0,0.15)');
  stripe.addColorStop(0.7,'rgba(255,215,0,0.15)');
  stripe.addColorStop(1,'transparent');
  ctx.fillStyle=stripe; ctx.fillRect(0,34,W,8);

  // Чип (золотой прямоугольник)
  const chipX=30, chipY=70, chipW=50, chipH=38;
  const chip=ctx.createLinearGradient(chipX,chipY,chipX+chipW,chipY+chipH);
  chip.addColorStop(0,'#d4a017'); chip.addColorStop(0.5,'#f1c40f'); chip.addColorStop(1,'#c8960c');
  ctx.fillStyle=chip; roundRect(ctx,chipX,chipY,chipW,chipH,5); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1;
  roundRect(ctx,chipX,chipY,chipW,chipH,5); ctx.stroke();
  // Линии чипа
  ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1;
  for (let i=1;i<4;i++) { ctx.beginPath(); ctx.moveTo(chipX+i*12,chipY+4); ctx.lineTo(chipX+i*12,chipY+chipH-4); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(chipX+4,chipY+chipH/2); ctx.lineTo(chipX+chipW-4,chipY+chipH/2); ctx.stroke();

  // Волнистые линии (NFC)
  ctx.strokeStyle='rgba(255,215,0,0.5)'; ctx.lineWidth=1.5;
  for (let i=0;i<3;i++) {
    ctx.beginPath(); ctx.arc(chipX+chipW+20,chipY+chipH/2,12+i*8,-(Math.PI*0.6),Math.PI*0.6);
    ctx.stroke();
  }

  // Логотип вверху
  ctx.fillStyle='#f1c40f'; ctx.font='bold 16px sans-serif';
  ctx.fillText('Феникс RPG',30,35);

  // Тип карты
  ctx.fillStyle='rgba(255,215,0,0.6)'; ctx.font='11px sans-serif';
  ctx.textAlign='right'; ctx.fillText('GOLD CARD',W-20,35); ctx.textAlign='left';

  // Номер карты (на основе золота игрока)
  const fakeNum = `**** **** **** ${String(p.wins||0).padStart(4,'0')}`;
  ctx.fillStyle='rgba(255,215,0,0.85)'; ctx.font='bold 20px monospace';
  ctx.fillText(fakeNum, 30, 158);

  // Имя владельца
  ctx.fillStyle='rgba(255,215,0,0.6)'; ctx.font='10px sans-serif';
  ctx.fillText('ВЛАДЕЛЕЦ КАРТЫ', 30, 186);
  ctx.fillStyle='#f1c40f'; ctx.font='bold 14px sans-serif';
  ctx.fillText(p.name.toUpperCase(), 30, 202);

  // Срок действия
  const lvl = p.level;
  ctx.fillStyle='rgba(255,215,0,0.6)'; ctx.font='10px sans-serif';
  ctx.fillText('УРОВЕНЬ', 200, 186);
  ctx.fillStyle='#f1c40f'; ctx.font='bold 14px sans-serif';
  ctx.fillText(`${lvl} LVL`, 200, 202);

  // БАЛАНС — главный элемент
  ctx.fillStyle='rgba(255,215,0,0.5)'; ctx.font='11px sans-serif';
  ctx.fillText('БАЛАНС ЗОЛОТА', 30, 232);

  const goldStr = p.gold.toLocaleString('ru-RU');
  ctx.font='bold 32px sans-serif';
  // Тень текста
  ctx.fillStyle='rgba(0,0,0,0.4)';
  ctx.fillText(`${goldStr}`, 32, 260);
  // Золотой текст
  const goldGrad=ctx.createLinearGradient(30,235,200,260);
  goldGrad.addColorStop(0,'#fff7aa');
  goldGrad.addColorStop(0.4,'#f1c40f');
  goldGrad.addColorStop(1,'#e67e22');
  ctx.fillStyle=goldGrad;
  ctx.fillText(`${goldStr}`, 30, 258);

  // Иконка монеты рядом с балансом
  drawIcon(ctx,'gold',W-50,245,20);

  return canvas.toBuffer('image/png');
}

async function generateFleeCard(p, monsterName) {
  const W=420,H=180,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d','#0a0a1a','#95a5a6');
  const AR=55;
  try { const img=await fetchAvatarCached(p.name+p.class); drawAvatar(ctx,img,AR+15,H/2,AR,'#95a5a6'); } catch {}
  const PX=AR*2+30;
  ctx.fillStyle='#95a5a6'; ctx.font='bold 24px sans-serif'; ctx.fillText('Побег!',PX,44);
  ctx.strokeStyle='#95a5a640'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,52); ctx.lineTo(W-16,52); ctx.stroke();
  ctx.fillStyle='#aaa'; ctx.font='14px sans-serif';
  ctx.fillText(`Ты сбежал от: ${monsterName}`,PX,74);
  ctx.fillStyle='#666'; ctx.font='13px sans-serif';
  ctx.fillText('Награда потеряна, зато жив!',PX,96);
  drawBar(ctx,PX,118,W-PX-16,p.hp,p.max_hp,'#e74c3c','HP','hp');
  ctx.fillStyle='#555'; ctx.font='12px sans-serif';
  drawMixed(ctx,`{gold} ${p.gold} золота  •  Ур. ${p.level}`,PX,158,9);
  return canvas.toBuffer('image/png');
}

async function generateRestCard(p, restCost, payFrom='wallet') {
  const W=420,H=190,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d','#0a1a0a','#27ae60');
  const AR=55;
  try { const img=await fetchAvatarCached(p.name+p.class); drawAvatar(ctx,img,AR+15,H/2,AR,'#27ae60'); } catch {}
  const PX=AR*2+30;
  ctx.fillStyle='#27ae60'; ctx.font='bold 22px sans-serif'; ctx.fillText('🏠 Таверна',PX,44);
  ctx.fillStyle='#aaa'; ctx.font='13px sans-serif'; ctx.fillText('Полностью восстановлен!',PX,66);
  ctx.strokeStyle='#27ae6040'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,74); ctx.lineTo(W-16,74); ctx.stroke();
  drawBar(ctx,PX,88,W-PX-16,p.hp,p.max_hp,'#e74c3c','HP');
  drawBar(ctx,PX,120,W-PX-16,p.mana,p.max_mana,'#3498db','МАНА');
  ctx.fillStyle='#27ae6040'; roundRect(ctx,PX,152,W-PX-16,28,6); ctx.fill();
  const fromLabel = payFrom==='card' ? `💳 Карта: -${restCost}🪙  (осталось: ${p.card_gold||0}🪙)` : `👛 Кошелёк: -${restCost}🪙  (осталось: ${p.gold}🪙)`;
  ctx.fillStyle='#f1c40f'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
  ctx.fillText(fromLabel, PX+(W-PX-16)/2, 171);
  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

async function generateDailyCard(p, goldGain, xpGain, lvlUp) {
  const W=420,H=200,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d','#1a1200','#f1c40f');
  const AR=60;
  try { const img=await fetchAvatarCached(p.name+p.class); drawAvatar(ctx,img,AR+15,H/2,AR,'#f1c40f'); } catch {}
  const PX=AR*2+30;
  ctx.fillStyle='#f1c40f'; ctx.font='bold 22px sans-serif'; ctx.fillText('Ежедневная награда!',PX,45);
  ctx.strokeStyle='#f1c40f40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,52); ctx.lineTo(W-20,52); ctx.stroke();
  ctx.fillStyle='#f1c40f'; ctx.font='bold 16px sans-serif';
  drawMixed(ctx,`{gold} +${goldGain} золота`,PX,80,12);
  ctx.fillStyle='#a29bfe';
  drawMixed(ctx,`{xp} +${xpGain} опыта`,PX,104,12);
  if (lvlUp) { ctx.fillStyle='#2ecc71'; ctx.fillText(`${lvlUp}`,PX,128); }
  ctx.fillStyle='#666'; ctx.font='12px sans-serif';
  drawMixed(ctx,`{gold} Золото: ${p.gold}  ·  Уровень: ${p.level}`,PX,158,9);
  drawBar(ctx,PX,170,W-PX-20,p.xp,XP_PER_LEVEL(p.level),'#f1c40f','ОПЫТ','xp');
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА КВЕСТА
// ──────────────────────────────────────────────────────────────
async function generateQuestCard(q, quest, done) {
  const W=440,H=180,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  const accent=done?'#f1c40f':'#1abc9c';
  cardBase(ctx,W,H,'#0d0d0d',done?'#1a1500':'#0a1a14',accent);
  ctx.fillStyle=accent; ctx.font='bold 20px sans-serif';
  ctx.fillText(done?'Квест выполнен!':'Активный квест',20,40);
  ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif'; ctx.fillText(q.quest,20,68);
  ctx.fillStyle='#aaa'; ctx.font='13px sans-serif'; ctx.fillText(quest?.desc||'',20,88);
  ctx.strokeStyle=accent+'40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(20,96); ctx.lineTo(W-20,96); ctx.stroke();
  drawBar(ctx,20,112,W-40,Math.min(q.progress,q.goal),q.goal,accent,'ПРОГРЕСС');
  ctx.fillStyle='#f1c40f'; ctx.font='bold 14px sans-serif';
  drawMixed(ctx,`{xp} ${q.reward_xp} XP    {gold} ${q.reward_gold} золота`,20,148,11);
  if (done) { ctx.fillStyle='#2ecc71'; ctx.font='bold 15px sans-serif'; ctx.fillText('Награда получена!',20,168); }
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ИНВЕНТАРЯ
// ──────────────────────────────────────────────────────────────
async function generateInventoryCard(items, p) {
  const W=460, ITEM_H=50, PAD=12, TOP=56, FOOTER=44;
  const H = items.length===0 ? 150 : TOP + items.length*(ITEM_H+PAD) + FOOTER;
  const canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d','#0d0019','#8e44ad');

  // Заголовок
  ctx.fillStyle='#8e44ad'; ctx.font='bold 18px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Инвентарь',W/2,34); ctx.textAlign='left';
  const totalQty=items.reduce((s,i)=>s+i.qty,0);
  ctx.fillStyle='#555'; ctx.font='12px sans-serif'; ctx.textAlign='right';
  ctx.fillText(`${totalQty} / 20`,W-PAD,34); ctx.textAlign='left';
  ctx.strokeStyle='#8e44ad40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PAD,44); ctx.lineTo(W-PAD,44); ctx.stroke();

  if (items.length===0) {
    ctx.fillStyle='#555'; ctx.font='14px sans-serif'; ctx.textAlign='center';
    ctx.fillText('Пусто — загляни в /shop!',W/2,100); ctx.textAlign='left';
  } else {
    items.forEach((item,i)=>{
      const y=TOP+i*(ITEM_H+PAD);
      // Фон строки
      ctx.fillStyle='#ffffff08'; roundRect(ctx,PAD,y,W-PAD*2,ITEM_H,8); ctx.fill();
      ctx.strokeStyle='#8e44ad35'; ctx.lineWidth=1; roundRect(ctx,PAD,y,W-PAD*2,ITEM_H,8); ctx.stroke();
      // Полоска слева
      ctx.fillStyle='#8e44ad'; roundRect(ctx,PAD,y+8,3,ITEM_H-16,2); ctx.fill();
      // Номер
      ctx.fillStyle='#444'; ctx.font='11px sans-serif';
      ctx.fillText(`${i+1}`,PAD+10,y+ITEM_H/2+4);
      // Название
      ctx.fillStyle='#fff'; ctx.font='bold 14px sans-serif';
      ctx.fillText(item.item,PAD+28,y+20);
      // Эффект
      const si=SHOP_ITEMS.find(s=>s.name===item.item);
      if (si) {
        if (si.effect==='card') {
          ctx.fillStyle='#f1c40f'; ctx.font='12px sans-serif';
          ctx.fillText('Просмотр баланса золота',PAD+28,y+38);
        } else {
          const effMap={hp:'HP',mana:'Мана',atk:'Атака',def:'Защита',xp:'Опыт'};
          const [st,vl]=si.effect.split('+');
          ctx.fillStyle='#777'; ctx.font='12px sans-serif';
          ctx.fillText(`+${vl} ${effMap[st]||st}`,PAD+28,y+38);
        }
      }
      // Кол-во справа — крупно
      ctx.fillStyle='#8e44ad'; ctx.font='bold 18px sans-serif'; ctx.textAlign='right';
      ctx.fillText(`x${item.qty}`,W-PAD-16,y+ITEM_H/2+6);
      ctx.textAlign='left';
    });
  }

  ctx.fillStyle='#8e44ad30'; roundRect(ctx,PAD,H-FOOTER+6,W-PAD*2,32,6); ctx.fill();
  ctx.fillStyle='#888'; ctx.font='12px sans-serif';
  drawMixed(ctx,`/use <предмет>  •  {gold} ${p.gold}`, PAD+8, H-20, 9);
  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ТАБЛИЦЫ ЛИДЕРОВ
// ──────────────────────────────────────────────────────────────
async function generateTopCard(players) {
  const W=500, ROW_H=64, H=70+players.length*ROW_H+16;
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d','#1a1200','#e67e22');
  ctx.fillStyle='#e67e22'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Таблица Лидеров',W/2,40); ctx.textAlign='left';
  ctx.strokeStyle='#e67e2250'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(16,50); ctx.lineTo(W-16,50); ctx.stroke();
  const medals=['🥇','🥈','🥉'];
  for (let i=0;i<players.length;i++) {
    const r=players[i], y=58+i*ROW_H;
    const cls=CLASSES[r.class]||CLASSES['Воин'];
    const wr=r.wins+r.losses>0?Math.round(r.wins/(r.wins+r.losses)*100):0;
    ctx.fillStyle='#ffffff07'; roundRect(ctx,12,y,W-24,ROW_H-6,10); ctx.fill();
    ctx.strokeStyle=cls.accent+'35'; ctx.lineWidth=1; roundRect(ctx,12,y,W-24,ROW_H-6,10); ctx.stroke();
    ctx.fillStyle=cls.accent; roundRect(ctx,12,y+8,3,ROW_H-22,2); ctx.fill();
    ctx.fillStyle=cls.accent; ctx.font='bold 16px sans-serif';
    ctx.fillText(medals[i]||`${i+1}`,24,y+28);
    ctx.fillStyle='#fff'; ctx.font='bold 15px sans-serif';
    ctx.fillText(`${cls.emoji} ${r.name}`,50,y+25);
    ctx.fillStyle=cls.accent+'cc'; ctx.font='11px sans-serif';
    ctx.fillText(r.class,50,y+42);
    // Статы — каждый отдельно, выровнены справа
    const cols=[
      {l:'УР.',    v:String(r.level),  rx:W-315},
      {l:'ПОБЕД',  v:String(r.wins),   rx:W-245},
      {l:'ПОРАЖ',  v:String(r.losses), rx:W-175},
      {l:'ПОБЕДЫ', v:`${wr}%`,         rx:W-100},
      {l:'ЗОЛОТО', v:String(r.gold),   rx:W-22},
    ];
    for (const s of cols) {
      ctx.fillStyle='#fff'; ctx.font='bold 14px sans-serif'; ctx.textAlign='right';
      ctx.fillText(s.v,s.rx,y+25);
      ctx.fillStyle='#555'; ctx.font='10px sans-serif';
      ctx.fillText(s.l,s.rx,y+40);
      ctx.textAlign='left';
    }
  }
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ДОСТИЖЕНИЙ
// ──────────────────────────────────────────────────────────────
async function generateAchievementsCard(p, unlocked) {
  const all=ACHIEVEMENTS_LIST, COLS=2, CW=200, CH=58, PAD=10;
  const ROWS=Math.ceil(all.length/COLS);
  const W=COLS*CW+(COLS+1)*PAD, H=54+ROWS*CH+(ROWS+1)*PAD+10;
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d','#1a1500','#f1c40f');
  ctx.fillStyle='#f1c40f'; ctx.font='bold 18px sans-serif'; ctx.textAlign='center';
  ctx.fillText(`Достижения  ${unlocked.length}/${all.length}`,W/2,34); ctx.textAlign='left';
  drawBar(ctx,PAD,42,W-PAD*2,unlocked.length,all.length,'#f1c40f','');
  all.forEach((a,i)=>{
    const col=i%COLS, row=Math.floor(i/COLS);
    const x=PAD+col*(CW+PAD), y=58+PAD+row*(CH+PAD);
    const done=unlocked.includes(a.id);
    ctx.fillStyle=done?'#ffffff12':'#ffffff05'; roundRect(ctx,x,y,CW,CH,8); ctx.fill();
    ctx.strokeStyle=done?'#f1c40f50':'#444'; ctx.lineWidth=1; roundRect(ctx,x,y,CW,CH,8); ctx.stroke();
    ctx.fillStyle=done?'#f1c40f':'#555'; ctx.font=`bold 18px sans-serif`; ctx.fillText(a.icon,x+10,y+26);
    ctx.fillStyle=done?'#fff':'#555'; ctx.font=`bold 11px sans-serif`; ctx.fillText(a.name,x+36,y+20);
    ctx.fillStyle=done?'#888':'#444'; ctx.font='10px sans-serif'; ctx.fillText(a.desc,x+36,y+36);
    if (done) {
      ctx.fillStyle='#2ecc71'; ctx.beginPath();
      ctx.arc(x+CW-14,y+14,7,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#fff'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x+CW-18,y+14); ctx.lineTo(x+CW-13,y+18); ctx.lineTo(x+CW-9,y+10); ctx.stroke();
    }
  });
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ЛОКАЦИИ
// ──────────────────────────────────────────────────────────────
async function generateLocationCard(loc, locName, p) {
  const mCount=loc.monsters.length;
  const W=480, H=110+mCount*58+52;
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d',loc.bg,loc.color);

  // Заголовок
  ctx.fillStyle=loc.color; ctx.font='bold 24px sans-serif';
  ctx.fillText(`${loc.emoji}  ${locName}`,20,44);
  ctx.strokeStyle=loc.color+'60'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(20,54); ctx.lineTo(W-20,54); ctx.stroke();

  // Минимальный уровень
  ctx.fillStyle='#888'; ctx.font='13px sans-serif';
  ctx.fillText(`Минимальный уровень: ${loc.minLvl}  •  Твой уровень: ${p.level}`,20,76);

  // Враги
  ctx.fillStyle='#fff'; ctx.font='bold 14px sans-serif';
  drawMixed(ctx,'{atk}  Враги в этой локации:',20,102,11);

  loc.monsters.forEach((mn,i)=>{
    const m=MONSTERS[mn]; if (!m) return;
    const y=116+i*58;
    // Карточка монстра
    ctx.fillStyle='#ffffff08'; roundRect(ctx,16,y,W-32,50,8); ctx.fill();
    ctx.strokeStyle=(m.accent||'#aaa')+'40'; ctx.lineWidth=1; roundRect(ctx,16,y,W-32,50,8); ctx.stroke();
    ctx.fillStyle=(m.accent||'#aaa')+'30'; roundRect(ctx,16,y,4,50,2); ctx.fill();
    // Иконка монстра — цветной круг с буквой
    const monsterInitial = mn[0];
    ctx.fillStyle=m.accent||'#aaa';
    ctx.beginPath(); ctx.arc(36,y+20,11,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(36,y+20,11,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=m.accent||'#fff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
    ctx.fillText(monsterInitial,36,y+24); ctx.textAlign='left';
    // Название монстра
    ctx.fillStyle=m.accent||'#aaa'; ctx.font='bold 15px sans-serif';
    ctx.fillText(mn,54,y+17);
    // Способность
    const ab=ABILITIES[m.ability];
    if (ab) { ctx.fillStyle=m.accent+'99'; ctx.font='11px sans-serif'; ctx.fillText(ab.name,54+ctx.measureText(mn).width+10,y+17); }
    // Статы монстра — через drawMixed с иконками
    ctx.fillStyle='#aaa'; ctx.font='12px sans-serif';
    let sx=54;
    const statParts=[
      {icon:'hp',  val:`${m.hp}`},
      {icon:'atk', val:`${m.atk}`},
      {icon:'def', val:`${m.def}`},
      {icon:'xp',  val:`${m.xp}`},
      {icon:'gold',val:`${m.gold[0]}-${m.gold[1]}`},
    ];
    for (const s of statParts) {
      drawIcon(ctx,s.icon,sx+6,y+31,8);
      ctx.fillStyle='#aaa'; ctx.font='12px sans-serif';
      ctx.fillText(s.val, sx+16, y+35);
      sx+=16+ctx.measureText(s.val).width+12;
    }
  });

  // Нижняя панель статуса
  const py=H-46;
  const canEnter=p.level>=loc.minLvl;
  ctx.fillStyle=(canEnter?'#2ecc71':'#e74c3c')+'30'; roundRect(ctx,12,py,W-24,36,8); ctx.fill();
  ctx.strokeStyle=(canEnter?'#2ecc71':'#e74c3c')+'60'; ctx.lineWidth=1; roundRect(ctx,12,py,W-24,36,8); ctx.stroke();
  ctx.fillStyle=canEnter?'#2ecc71':'#e74c3c'; ctx.font='bold 14px sans-serif'; ctx.textAlign='center';
  ctx.fillText(canEnter?`Ты сейчас в ${locName}!`:`Нужен уровень ${loc.minLvl} для входа`,W/2,py+23);
  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА КАЗИНО
// ──────────────────────────────────────────────────────────────
async function generateCasinoCard(p, game, won, bet, gain) {
  const W=420,H=200,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
  const accent=won?'#2ecc71':'#e74c3c';
  cardBase(ctx,W,H,'#0d0d0d','#1a001a',accent);
  const AR=55;
  try { const img=await fetchAvatarCached(p.name+p.class); drawAvatar(ctx,img,AR+15,H/2,AR,accent); } catch {}
  const PX=AR*2+30;
  ctx.fillStyle=accent; ctx.font='bold 22px sans-serif';
  ctx.fillText(won?'ВЫИГРЫШ!':'ПРОИГРЫШ',PX,44);
  ctx.fillStyle='#aaa'; ctx.font='14px sans-serif'; ctx.fillText(game,PX,66);
  ctx.strokeStyle=accent+'40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,74); ctx.lineTo(W-20,74); ctx.stroke();
  ctx.fillStyle=won?'#f1c40f':'#e74c3c'; ctx.font='bold 16px sans-serif';
  drawMixed(ctx,won?`{gold} +${gain} золота`:`{gold} -${bet} золота`,PX,100,12);
  ctx.fillStyle='#888'; ctx.font='13px sans-serif';
  drawMixed(ctx,`Ставка: ${bet} {gold}  •  Итого: ${p.gold} {gold}`,PX,124,9);
  drawBar(ctx,PX,148,W-PX-20,Math.min(p.gold,1000),1000,'#f1c40f','ЗОЛОТО','gold');
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ПОМОЩИ (/help)
// ──────────────────────────────────────────────────────────────
async function generateHelpCard() {
  const cmds = [
    {n:'/start',       d:'Создать персонажа',          cat:'⚙️'},
    {n:'/profile',     d:'Профиль и статы',             cat:'⚙️'},
    {n:'/stats',       d:'Детальная статистика',        cat:'⚙️'},
    {n:'/customize',   d:'Сменить расу/класс',          cat:'⚙️'},
    {n:'/fight',       d:'Начать бой с монстром',       cat:'⚔️'},
    {n:'/duel',        d:'PvP дуэль с игроком',         cat:'⚔️'},
    {n:'/location',    d:'Сменить локацию боёв',        cat:'⚔️'},
    {n:'/rest',        d:'Отдохнуть · платно или ждать',cat:'⚔️'},
    {n:'/shop',        d:'Магазин снаряжения',          cat:'🛍️'},
    {n:'/inventory',   d:'Твой инвентарь',              cat:'🛍️'},
    {n:'/use',         d:'Использовать предмет',        cat:'🛍️'},
    {n:'/drop',        d:'Выбросить предмет',           cat:'🛍️'},
    {n:'/pet',         d:'Магазин питомцев',            cat:'🛍️'},
    {n:'/card',        d:'Посмотреть банковскую карту', cat:'💳'},
    {n:'/deposit',     d:'Положить золото на карту',    cat:'💳'},
    {n:'/withdraw',    d:'Снять золото с карты',        cat:'💳'},
    {n:'/sell',        d:'Продать карту за 40% цены',   cat:'💳'},
    {n:'/trade',       d:'Обменять карту с игроком',    cat:'💳'},
    {n:'/quest',       d:'Квест',                       cat:'📜'},
    {n:'/daily',       d:'Ежедневная награда',          cat:'📜'},
    {n:'/weekly',      d:'Недельный рейтинг',           cat:'📜'},
    {n:'/achievements',d:'Достижения',                  cat:'📜'},
    {n:'/top',         d:'Таблица лидеров',             cat:'📜'},
    {n:'/market',      d:'Рынок — купи/продай предметы', cat:'🛒'},
    {n:'/explore',     d:'Исследовать локацию (3/день)', cat:'🗺️'},
    {n:'/upgrade',     d:'Улучшить снаряжение (макс +10)',cat:'🔨'},
    {n:'/profession',  d:'Профессия — пассивные бонусы', cat:'⚗️'},
    {n:'/gamble',      d:'Казино',                      cat:'🎲'},
    {n:'/guild',       d:'Гильдия',                     cat:'🏰'},
    {n:'/help',        d:'Эта карточка',                cat:'❓'},
  ];
  const COLS=2, CW=230, CH=36, PAD=8;
  const ROWS=Math.ceil(cmds.length/COLS);
  const W=COLS*CW+(COLS+1)*PAD, H=64+ROWS*(CH+PAD)+PAD;
  const canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  cardBase(ctx,W,H,'#0d0d0d','#001a2a','#3498db');
  // Заголовок
  ctx.fillStyle='#3498db'; ctx.font='bold 21px sans-serif'; ctx.textAlign='center';
  ctx.fillText('📖 Все команды Феникс RPG',W/2,36); ctx.textAlign='left';
  ctx.strokeStyle='#3498db40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PAD,48); ctx.lineTo(W-PAD,48); ctx.stroke();
  // Команды
  const catColors = {'⚙️':'#aaa','⚔️':'#e74c3c','🛍️':'#e67e22','💳':'#f1c40f','📜':'#2ecc71','🎲':'#9b59b6','🏰':'#e67e22','❓':'#3498db'};
  cmds.forEach((c,i)=>{
    const col=i%COLS, row=Math.floor(i/COLS);
    const x=PAD+col*(CW+PAD), y=54+PAD+row*(CH+PAD);
    const ac=catColors[c.cat]||'#3498db';
    ctx.fillStyle='#ffffff06'; roundRect(ctx,x,y,CW,CH,6); ctx.fill();
    ctx.strokeStyle=ac+'30'; ctx.lineWidth=1; roundRect(ctx,x,y,CW,CH,6); ctx.stroke();
    // Полоска-категория слева
    ctx.fillStyle=ac; roundRect(ctx,x,y,3,CH,3); ctx.fill();
    ctx.fillStyle=ac; ctx.font='bold 12px sans-serif'; ctx.fillText(c.n,x+10,y+14);
    ctx.fillStyle='#888'; ctx.font='10px sans-serif'; ctx.fillText(c.d,x+10,y+27);
    ctx.font='13px sans-serif'; ctx.fillText(c.cat,x+CW-20,y+CH/2+5);
  });
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА РЫНКА (/market)
// ──────────────────────────────────────────────────────────────
async function generateMarketCard(listings, p) {
  const ROW_H = 60, HEADER = 68, FOOTER = 36;
  const empty = listings.length === 0;
  const W = 460, H = HEADER + (empty ? 80 : listings.length * ROW_H) + FOOTER;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const accent = '#e67e22';
  cardBase(ctx, W, H, '#0d0d0d', '#1a0d00', accent);

  // Header
  ctx.fillStyle = accent; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🛒 Рынок игроков', W/2, 34); ctx.textAlign = 'left';
  ctx.fillStyle = '#aaa'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`💰 Твой кошелёк: ${(p.gold||0).toLocaleString('ru')} 🪙  ·  Лотов: ${listings.length}`, W/2, 56);
  ctx.textAlign = 'left';
  ctx.strokeStyle = accent + '50'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(16, 64); ctx.lineTo(W-16, 64); ctx.stroke();

  if (empty) {
    ctx.fillStyle = '#555'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Рынок пуст. Выстави предмет:', W/2, HEADER+30);
    ctx.fillStyle = accent; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('/market <предмет> <цена>', W/2, HEADER+54);
    ctx.textAlign = 'left';
  } else {
    const AUTO_BUY_H = 12 * 60 * 60 * 1000;
    listings.forEach((lot, i) => {
      const Y = HEADER + i * ROW_H;
      const isOwn = lot.seller_id === p.id;
      const canAfford = p.gold >= lot.price;
      const elapsed = Date.now() - lot.listed_at;
      const hoursLeft = Math.max(0, Math.ceil((AUTO_BUY_H - elapsed) / 3600000));
      const rowAc = isOwn ? '#888' : canAfford ? accent : '#555';

      ctx.fillStyle = isOwn ? '#111' : '#0f0a00';
      roundRect(ctx, 12, Y+4, W-24, ROW_H-8, 8); ctx.fill();
      ctx.strokeStyle = rowAc + '60'; ctx.lineWidth = 1;
      roundRect(ctx, 12, Y+4, W-24, ROW_H-8, 8); ctx.stroke();

      // Номер лота
      ctx.fillStyle = '#444'; ctx.font = '11px sans-serif';
      ctx.fillText(`#${lot.id}`, 20, Y+22);

      // Предмет
      ctx.fillStyle = isOwn ? '#888' : '#fff'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText(lot.item, 42, Y+22);
      ctx.fillStyle = '#666'; ctx.font = '11px sans-serif';
      ctx.fillText(`от ${lot.seller_name}${isOwn ? ' (твой лот)' : ''}`, 42, Y+40);

      // Цена и таймер справа
      ctx.textAlign = 'right';
      ctx.fillStyle = canAfford && !isOwn ? '#ffd700' : '#888'; ctx.font = 'bold 15px sans-serif';
      ctx.fillText(`${lot.price.toLocaleString('ru')} 🪙`, W-20, Y+22);
      ctx.fillStyle = '#555'; ctx.font = '10px sans-serif';
      ctx.fillText(`🤖 бот купит через ${hoursLeft}ч`, W-20, Y+40);
      ctx.textAlign = 'left';

      if (i < listings.length-1) {
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(16,Y+ROW_H); ctx.lineTo(W-16,Y+ROW_H); ctx.stroke();
      }
    });
  }

  // Footer
  ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Через 12ч без покупателя — бот выкупает за 40% цены', W/2, H-10);
  ctx.textAlign = 'left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ИССЛЕДОВАНИЯ (/explore)
// ──────────────────────────────────────────────────────────────
async function generateExploreCard(p, event, result) {
  const W=460, H=260, canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const loc = LOCATIONS[p.location||'Лес'];
  const accent = loc.color;
  cardBase(ctx,W,H,'#0d0d0d', loc.bg||'#0d0d0d', accent);

  // Большой эмодзи события
  ctx.font='64px sans-serif'; ctx.textAlign='center';
  ctx.fillText(event.emoji, W/2, 88);

  // Заголовок
  ctx.fillStyle=accent; ctx.font='bold 22px sans-serif';
  ctx.fillText(event.title, W/2, 126);

  // Описание
  ctx.fillStyle='#ccc'; ctx.font='14px sans-serif';
  ctx.fillText(event.desc, W/2, 152);

  // Результат
  ctx.fillStyle='#fff'; ctx.font='bold 17px sans-serif';
  ctx.fillText(result, W/2, 186);

  // Локация и подсказка
  ctx.fillStyle='#555'; ctx.font='11px sans-serif';
  ctx.fillText(`${loc.emoji} ${p.location||'Лес'}  ·  /explore — исследуй снова`, W/2, 228);
  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА УЛУЧШЕНИЯ (/upgrade)
// ──────────────────────────────────────────────────────────────
async function generateUpgradeCard(p, itemName, curLvl, newLvl, cost, success) {
  const W=460, H=220, canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const accent = success ? '#2ecc71' : curLvl===0 ? '#f39c12' : '#e74c3c';
  cardBase(ctx,W,H,'#0d0d0d','#0a1a00', accent);

  ctx.fillStyle=accent; ctx.font='bold 20px sans-serif'; ctx.textAlign='center';
  const titleTxt = success===null ? `🔨 Улучшение: ${itemName}` : success ? `✅ Улучшено!` : `❌ Провал!`;
  ctx.fillText(titleTxt, W/2, 38);

  // Полоска уровней
  const MAX=5, bw=50, gap=12, totalW=MAX*(bw+gap)-gap;
  const startX=(W-totalW)/2;
  for(let i=0;i<MAX;i++){
    const filled = i < (success ? newLvl : curLvl);
    ctx.fillStyle = filled ? accent : '#222';
    roundRect(ctx, startX+i*(bw+gap), 52, bw, 20, 6); ctx.fill();
    ctx.strokeStyle = accent+'60'; ctx.lineWidth=1;
    roundRect(ctx, startX+i*(bw+gap), 52, bw, 20, 6); ctx.stroke();
    ctx.fillStyle = filled?'#fff':'#444'; ctx.font='bold 11px sans-serif';
    ctx.fillText(`+${(i+1)*2}`, startX+i*(bw+gap)+bw/2-8, 66);
  }
  ctx.fillStyle='#888'; ctx.font='11px sans-serif';
  ctx.fillText(`Уровень ${curLvl} → ${newLvl}  ·  Макс: 5`, W/2, 92);

  if(success===null){
    // Инфо: сколько стоит
    ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif';
    ctx.fillText(`Стоимость улучшения: ${cost.toLocaleString('ru')} 🪙`, W/2, 130);
    const pct = curLvl>=4?60:curLvl>=2?80:100;
    ctx.fillStyle='#888'; ctx.font='13px sans-serif';
    ctx.fillText(`Шанс успеха: ${pct}%  ·  У тебя: ${p.gold.toLocaleString('ru')}🪙`, W/2, 156);
    ctx.fillStyle=p.gold>=cost?'#2ecc71':'#e74c3c'; ctx.font='bold 12px sans-serif';
    ctx.fillText(p.gold>=cost?'💰 Достаточно золота':'💸 Не хватает золота', W/2, 182);
  } else {
    ctx.fillStyle=success?'#2ecc71':'#e74c3c'; ctx.font='bold 18px sans-serif';
    ctx.fillText(success?`Бонус +${newLvl*2} к характеристике!`:'Улучшение не удалось. Предмет цел.', W/2, 140);
    ctx.fillStyle='#888'; ctx.font='13px sans-serif';
    ctx.fillText(`Осталось золота: ${p.gold.toLocaleString('ru')}🪙`, W/2, 170);
  }
  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ПРОФЕССИИ (/profession)
// ──────────────────────────────────────────────────────────────
async function generateProfessionCard(p) {
  const profs = Object.entries(PROFESSIONS);
  const ROW_H=62, HEADER=64, FOOTER=36;
  const W=460, H=HEADER+profs.length*ROW_H+FOOTER;
  const canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const accent='#9b59b6';
  cardBase(ctx,W,H,'#0d0d0d','#0d001a',accent);
  ctx.fillStyle=accent; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
  ctx.fillText('⚗️ Выбор профессии', W/2, 34); ctx.textAlign='left';
  const curProf = p.profession||'';
  ctx.fillStyle='#aaa'; ctx.font='12px sans-serif'; ctx.textAlign='center';
  ctx.fillText(curProf ? `Текущая: ${PROFESSIONS[curProf]?.emoji} ${curProf}` : 'Профессия не выбрана', W/2, 54);
  ctx.textAlign='left';
  ctx.strokeStyle=accent+'40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(16,62); ctx.lineTo(W-16,62); ctx.stroke();

  profs.forEach(([name,prof],i)=>{
    const Y=HEADER+i*ROW_H;
    const isActive = curProf===name;
    ctx.fillStyle=isActive?'#1a0d2a':'#111';
    roundRect(ctx,12,Y+4,W-24,ROW_H-8,8); ctx.fill();
    ctx.strokeStyle=(isActive?accent:'#333')+'80'; ctx.lineWidth=1;
    roundRect(ctx,12,Y+4,W-24,ROW_H-8,8); ctx.stroke();
    ctx.font='22px sans-serif'; ctx.fillText(prof.emoji, 24, Y+ROW_H/2+8);
    ctx.fillStyle=isActive?accent:'#fff'; ctx.font='bold 14px sans-serif';
    ctx.fillText(name+(isActive?' ✓':''), 56, Y+26);
    ctx.fillStyle='#888'; ctx.font='11px sans-serif';
    ctx.fillText(prof.desc, 56, Y+44);
    ctx.textAlign='right';
    ctx.fillStyle=isActive?'#2ecc71':'#555'; ctx.font='bold 12px sans-serif';
    ctx.fillText(isActive?'Активна':'Выбрать', W-20, Y+ROW_H/2+5);
    ctx.textAlign='left';
  });
  ctx.fillStyle='#333'; ctx.font='10px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Смена профессии стоит 500🪙', W/2, H-12);
  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА СТАТИСТИКИ (/stats)
// ──────────────────────────────────────────────────────────────
async function generateStatsCard(p, unlockedCount) {
  const W=460, H=300, canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const cls=CLASSES[p.class]||CLASSES['Воин'], accent=cls.accent;
  cardBase(ctx,W,H,'#0d0d0d',cls.bg,accent);
  const AR=55;
  try { const img=await fetchAvatarCached(p.name+p.class); drawAvatar(ctx,img,AR+15,H/2-20,AR,accent); } catch {}
  const PX=AR*2+30;
  ctx.fillStyle='#fff'; ctx.font='bold 20px sans-serif'; ctx.fillText(p.name,PX,36);
  ctx.fillStyle=accent; ctx.font='13px sans-serif'; ctx.fillText(`${p.class}  Ур.${p.level}`,PX,54);
  ctx.strokeStyle=accent+'40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,62); ctx.lineTo(W-16,62); ctx.stroke();

  const stats2=[
    ['Побед в бою',    p.wins],
    ['Поражений',      p.losses],
    ['PvP победы',     p.pvp_wins||0],
    ['Гоблинов убито', p.kills_goblin||0],
    ['Скелетов убито', p.kills_skeleton||0],
    ['Троллей убито',  p.kills_troll||0],
    ['Драконов убито', p.kills_dragon||0],
    ['Всего убито',    p.kills_total||0],
    ['Квестов выполн.',p.quests_done||0],
    ['Казино победы',  p.casino_wins||0],
    ['Золота заработано',p.gold_earned||0],
    ['Достижений',     `${unlockedCount}/${ACHIEVEMENTS_LIST.length}`],
  ];
  const cols2=2, cw2=(W-PX-20)/cols2;
  stats2.forEach(([l,v],i)=>{
    const col=i%cols2, row=Math.floor(i/cols2);
    const sx=PX+col*cw2, sy=72+row*36;
    ctx.fillStyle='#ffffff08'; roundRect(ctx,sx,sy,cw2-6,30,6); ctx.fill();
    ctx.fillStyle=accent; ctx.font='bold 13px sans-serif'; ctx.fillText(String(v),sx+8,sy+18);
    ctx.fillStyle='#666'; ctx.font='10px sans-serif'; ctx.fillText(l,sx+8,sy+28);
  });
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  МАГАЗИН ПИТОМЦЕВ
// ──────────────────────────────────────────────────────────────
async function generatePetShopCard(p) {
  const pets = Object.entries(PETS);
  const ROW_H = 72, HEADER = 64, FOOTER = 44;
  const W = 460, H = HEADER + pets.length * ROW_H + FOOTER;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const accent = '#ff9800';
  cardBase(ctx, W, H, '#0d0d0d', '#1a0d00', accent);

  // Header
  ctx.fillStyle = accent; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🐾 Магазин питомцев', W/2, 34); ctx.textAlign = 'left';
  ctx.fillStyle = '#aaa'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`Твоё золото: ${p.gold.toLocaleString('ru')} 🪙`, W/2, 54); ctx.textAlign = 'left';
  ctx.strokeStyle = accent + '60'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(16, 62); ctx.lineTo(W-16, 62); ctx.stroke();

  for (let i = 0; i < pets.length; i++) {
    const [name, pet] = pets[i];
    const Y = HEADER + i * ROW_H;
    const isOwned = p.pet === name;
    const canAfford = p.gold >= pet.cost;
    const rowAccent = isOwned ? '#2ecc71' : canAfford ? accent : '#555';

    // Row bg
    ctx.fillStyle = isOwned ? '#0a2010' : '#111';
    roundRect(ctx, 12, Y+4, W-24, ROW_H-8, 8);
    ctx.fill();
    ctx.strokeStyle = rowAccent + '80'; ctx.lineWidth = 1;
    roundRect(ctx, 12, Y+4, W-24, ROW_H-8, 8);
    ctx.stroke();

    // Number
    ctx.fillStyle = '#555'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`${i+1}`, 22, Y+ROW_H/2+5);

    // Pet emoji & name
    const PET_EMOJIS = { 'Волк':'🐺','Феникс':'🦅','Дракон':'🐉','Фея':'🧚','Медведь':'🐻' };
    ctx.font = '22px sans-serif'; ctx.fillText(PET_EMOJIS[name]||'🐾', 36, Y+ROW_H/2+8);
    ctx.fillStyle = isOwned ? '#2ecc71' : '#fff'; ctx.font = `bold 15px sans-serif`;
    ctx.fillText(name + (isOwned ? '  ✓ Активен' : ''), 68, Y+28);
    ctx.fillStyle = '#aaa'; ctx.font = '12px sans-serif';
    ctx.fillText(pet.desc, 68, Y+46);

    // Price / owned badge
    ctx.textAlign = 'right';
    if (isOwned) {
      ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('В команде', W-20, Y+28);
    } else {
      ctx.fillStyle = canAfford ? '#ffd700' : '#e74c3c'; ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${pet.cost.toLocaleString('ru')} 🪙`, W-20, Y+28);
    }
    ctx.fillStyle = '#888'; ctx.font = '12px sans-serif';
    ctx.fillText(pet.bonus, W-20, Y+46);
    ctx.textAlign = 'left';

    // Divider
    if (i < pets.length-1) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(16, Y+ROW_H); ctx.lineTo(W-16, Y+ROW_H); ctx.stroke();
    }
  }

  // Footer
  const FY = H - FOOTER + 12;
  ctx.fillStyle = '#555'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Нажми кнопку ниже чтобы купить питомца', W/2, FY+8);
  ctx.textAlign = 'left';
  return canvas.toBuffer('image/png');
}

//  КАРТОЧКА ПИТОМЦА
async function generatePetCard(p, petName) {
  const W=420, H=180, canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const pet=PETS[petName], accent='#ff9800';
  cardBase(ctx,W,H,'#0d0d0d','#1a1000',accent);
  const AR=55;
  try { const img=await fetchAvatarCached(`pet-${petName}`,'pixel-art-neutral'); drawAvatar(ctx,img,AR+15,H/2,AR,accent); } catch {}
  const PX=AR*2+30;
  ctx.fillStyle=accent; ctx.font='bold 20px sans-serif'; ctx.fillText(petName,PX,38);
  ctx.fillStyle='#aaa'; ctx.font='13px sans-serif'; ctx.fillText(pet.desc,PX,58);
  ctx.strokeStyle=accent+'40'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(PX,66); ctx.lineTo(W-16,66); ctx.stroke();
  ctx.fillStyle='#2ecc71'; ctx.font='bold 14px sans-serif'; ctx.fillText(`Бонус: ${pet.bonus}`,PX,88);
  drawBar(ctx,PX,102,W-PX-16,p.level,50,accent,'УРОВЕНЬ ХОЗЯИНА','xp');
  ctx.fillStyle='#888'; ctx.font='12px sans-serif';
  drawMixed(ctx,`{gold} Цена: ${pet.cost} золота`,PX,140,9);
  return canvas.toBuffer('image/png');
}

// ──────────────────────────────────────────────────────────────
//  КАРТОЧКА ГИЛЬДИИ
// ──────────────────────────────────────────────────────────────
async function generateGuildCard(guild, members) {
  const W=460, H=80+members.length*44+50, canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
  const accent='#e67e22';
  cardBase(ctx,W,H,'#0d0d0d','#1a0d00',accent);
  ctx.fillStyle=accent; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
  ctx.fillText(guild.name,W/2,38); ctx.textAlign='left';
  ctx.strokeStyle=accent+'50'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(16,48); ctx.lineTo(W-16,48); ctx.stroke();
  ctx.fillStyle='#aaa'; ctx.font='12px sans-serif';
  drawMixed(ctx,`Казна: {gold} ${guild.treasury}   Участников: ${members.length}`,16,68,9);
  members.forEach((m,i)=>{
    const y=80+i*44, cls=CLASSES[m.class]||CLASSES['Воин'];
    ctx.fillStyle='#ffffff07'; roundRect(ctx,12,y,W-24,38,8); ctx.fill();
    ctx.fillStyle=cls.accent; ctx.font='bold 13px sans-serif';
    ctx.fillText(`${m.role==='leader'?'[Лидер] ':''}${m.name}`,22,y+16);
    ctx.fillStyle='#666'; ctx.font='11px sans-serif';
    ctx.fillText(`${m.class}  Ур.${m.level}  Побед: ${m.wins}`,22,y+30);
  });
  const py=H-40;
  ctx.fillStyle=accent+'30'; roundRect(ctx,12,py,W-24,30,6); ctx.fill();
  ctx.fillStyle=accent; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Используй /guild donate <сумма> для пополнения казны',W/2,py+19);
  ctx.textAlign='left';
  return canvas.toBuffer('image/png');
}

module.exports = {
  generateBankCard,
  generateProfileCard,
  generateBattleCard,
  generateResultCard,
  generateShopCard,
  generateGoldCard,
  generateFleeCard,
  generateRestCard,
  generateDailyCard,
  generateQuestCard,
  generateInventoryCard,
  generateTopCard,
  generateAchievementsCard,
  generateLocationCard,
  generateCasinoCard,
  generateHelpCard,
  generateMarketCard,
  generateExploreCard,
  generateUpgradeCard,
  generateProfessionCard,
  generateStatsCard,
  generatePetShopCard,
  generatePetCard,
  generateGuildCard,
};
