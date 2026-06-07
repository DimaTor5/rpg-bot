'use strict';
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const { avatarCache, AVATAR_TTL } = require('../state');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r); ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h); ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r); ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
}

// Рисует строку с авто-заменой известных emoji на иконки
// Формат: "текст {gold} текст {hp} текст"
function drawMixed(ctx, str, x, y, iconSize=10) {
  const parts = str.split(/(\{[a-z]+\})/);
  let cx = x;
  for (const part of parts) {
    const m = part.match(/^\{([a-z]+)\}$/);
    if (m) {
      drawIcon(ctx, m[1], cx + iconSize/2, y - iconSize*0.15, iconSize);
      cx += iconSize + 3;
    } else if (part) {
      ctx.fillText(part, cx, y);
      cx += ctx.measureText(part).width;
    }
  }
  return cx; // возвращает конечную X позицию
}

// Иконки для баров — нарисованные canvas-фигуры
function drawIcon(ctx, type, x, y, size=9) {
  ctx.save();
  if (type==='hp') {
    // Сердечко из двух кругов + треугольник
    ctx.fillStyle='#e74c3c';
    ctx.beginPath(); ctx.arc(x-size*0.25, y-size*0.1, size*0.38, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+size*0.25, y-size*0.1, size*0.38, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x-size*0.6,y); ctx.lineTo(x,y+size*0.6); ctx.lineTo(x+size*0.6,y); ctx.fill();
  } else if (type==='mana') {
    // Ромб
    ctx.fillStyle='#3498db';
    ctx.beginPath(); ctx.moveTo(x,y-size*0.6); ctx.lineTo(x+size*0.5,y); ctx.lineTo(x,y+size*0.6); ctx.lineTo(x-size*0.5,y); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.moveTo(x,y-size*0.6); ctx.lineTo(x+size*0.5,y); ctx.lineTo(x,y); ctx.closePath(); ctx.fill();
  } else if (type==='xp') {
    // Звезда пятиконечная
    ctx.fillStyle='#f1c40f';
    ctx.beginPath();
    for (let i=0;i<5;i++) {
      const a=Math.PI/2+i*Math.PI*2/5, a2=a+Math.PI/5;
      const ox=x+Math.cos(a)*size*0.6, oy=y-Math.sin(a)*size*0.6;
      const ix=x+Math.cos(a2)*size*0.28, iy=y-Math.sin(a2)*size*0.28;
      i===0?ctx.moveTo(ox,oy):ctx.lineTo(ox,oy); ctx.lineTo(ix,iy);
    }
    ctx.closePath(); ctx.fill();
  } else if (type==='gold') {
    // Круг с точкой
    ctx.fillStyle='#f1c40f';
    ctx.beginPath(); ctx.arc(x,y,size*0.55,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#e67e22';
    ctx.beginPath(); ctx.arc(x,y,size*0.28,0,Math.PI*2); ctx.fill();
  } else if (type==='atk') {
    // Меч (линия + ромб)
    ctx.strokeStyle='#e74c3c'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(x-size*0.5,y+size*0.5); ctx.lineTo(x+size*0.5,y-size*0.5); ctx.stroke();
    ctx.fillStyle='#e74c3c';
    ctx.beginPath(); ctx.moveTo(x+size*0.3,y-size*0.6); ctx.lineTo(x+size*0.6,y-size*0.3); ctx.lineTo(x+size*0.5,y-size*0.5); ctx.closePath(); ctx.fill();
  } else if (type==='def') {
    // Щит
    ctx.fillStyle='#3498db';
    ctx.beginPath(); ctx.moveTo(x,y-size*0.6); ctx.lineTo(x+size*0.55,y-size*0.2); ctx.lineTo(x+size*0.4,y+size*0.4); ctx.lineTo(x,y+size*0.65); ctx.lineTo(x-size*0.4,y+size*0.4); ctx.lineTo(x-size*0.55,y-size*0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(x,y-size*0.55); ctx.lineTo(x+size*0.45,y-size*0.15); ctx.lineTo(x,y+size*0.1); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawBar(ctx, x, y, w, cur, max, color, label, iconType) {
  const pct = Math.max(0, Math.min(1, cur/max));
  // Иконка слева от подписи
  if (iconType) drawIcon(ctx, iconType, x+6, y-5, 8);
  const labelX = iconType ? x+16 : x;
  ctx.fillStyle='#aaa'; ctx.font='bold 11px sans-serif';
  ctx.textAlign='left'; ctx.fillText(label, labelX, y-2);
  ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif';
  ctx.textAlign='right'; ctx.fillText(`${cur}/${max}`, x+w, y-2);
  ctx.textAlign='left';
  // Трек
  ctx.fillStyle='#1a1a1a'; roundRect(ctx,x,y,w,14,7); ctx.fill();
  if (pct>0) {
    const g=ctx.createLinearGradient(x,y,x+w*pct,y);
    g.addColorStop(0,color+'cc'); g.addColorStop(1,color);
    ctx.fillStyle=g; roundRect(ctx,x,y,Math.max(14,w*pct),14,7); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.15)'; roundRect(ctx,x,y,Math.max(14,w*pct),6,4); ctx.fill();
  }
}

async function fetchAvatar(seed, style='adventurer', bg='transparent') {
  const url = `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(seed)}&size=200&backgroundColor=${bg}`;
  const r = await axios.get(url, { responseType:'arraybuffer', timeout:6000 });
  return loadImage(Buffer.from(r.data));
}

async function fetchAvatarCached(seed, style='adventurer', bg='transparent') {
  const key = `${seed}__${style}`;
  const cached = avatarCache.get(key);
  if (cached && Date.now() - cached.ts < AVATAR_TTL) return cached.img;
  const img = await fetchAvatar(seed, style, bg);
  avatarCache.set(key, { img, ts: Date.now() });
  return img;
}

function drawAvatar(ctx, img, cx, cy, r, accentColor) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
  if (img) ctx.drawImage(img, cx-r, cy-r, r*2, r*2);
  ctx.restore();
  const glow=ctx.createRadialGradient(cx,cy,r*0.5,cx,cy,r*1.5);
  glow.addColorStop(0,accentColor+'30'); glow.addColorStop(1,'transparent');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,r*1.5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=accentColor; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.arc(cx,cy,r+2,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle=accentColor;
  for (let i=0;i<8;i++) {
    const a=(i/8)*Math.PI*2-Math.PI/2;
    ctx.beginPath(); ctx.arc(cx+Math.cos(a)*(r+10),cy+Math.sin(a)*(r+10),2,0,Math.PI*2); ctx.fill();
  }
}

function cardBase(ctx, W, H, bgFrom, bgTo, accentColor, r=14) {
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#0d0d0d'); bg.addColorStop(1,bgTo);
  ctx.fillStyle=bg; roundRect(ctx,0,0,W,H,r); ctx.fill();
  const glow=ctx.createRadialGradient(W,0,10,W,0,250);
  glow.addColorStop(0,accentColor+'25'); glow.addColorStop(1,'transparent');
  ctx.fillStyle=glow; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=accentColor+'90'; ctx.lineWidth=2;
  roundRect(ctx,1,1,W-2,H-2,r-1); ctx.stroke();
  ctx.strokeStyle=accentColor+'20'; ctx.lineWidth=1;
  roundRect(ctx,5,5,W-10,H-10,r-3); ctx.stroke();
}

module.exports = {
  roundRect, drawMixed, drawIcon, drawBar,
  fetchAvatar, fetchAvatarCached, drawAvatar, cardBase,
};
