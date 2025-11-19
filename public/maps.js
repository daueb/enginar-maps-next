

/* ====== DOM ====== */
const wrap   = document.getElementById('wrap');
const mount  = document.getElementById('mount');
const pinLay = document.getElementById('pinLayer');
const sheet  = document.getElementById('infoSheet');
const iTitle = document.getElementById('iTitle');
const iSub   = document.getElementById('iSub');
const iDesc  = document.getElementById('iDesc');
const contentEl = document.querySelector('.sheet .content');
const iDescText = document.getElementById('iDescText');
const iMore     = document.getElementById('iMore');
const roomHead = document.getElementById('roomHead');
const rhBlock  = document.getElementById('rhBlock');
const rhFloor  = document.getElementById('rhFloor');
const rhRoom   = document.getElementById('rhRoom');
	function hasVisibleChip(){
  const chips = [rhBlock, rhFloor, rhRoom];
  return chips.some(c => c && !c.hidden && (c.textContent || '').trim().length > 0);
}
function resetRoomHead(){
  if (rhBlock) { rhBlock.textContent = ''; rhBlock.hidden = true; }
  if (rhFloor) { rhFloor.textContent = ''; rhFloor.hidden = true; }
  if (rhRoom)  { rhRoom.textContent  = ''; rhRoom.hidden  = true; }
  if (roomHead){ roomHead.hidden     = true; }
}

/* Search DOM */
const formEl  = document.getElementById('classSearch');
const inputEl = document.getElementById('classQuery');
const outEl   = document.getElementById('parseOut');

/* State */
let sheetState = 'closed'; // 'closed' | 'collapsed' | 'expanded'
let justOpenedAt = 0;
let lastSearchMeta = null;

let svgEl=null; let vbX0=0,vbY0=0,vbW0=1000,vbH0=1000;
let vX=0,vY=0,vW=1000,vH=1000;
let AUTOLOCK_MIN_W = null;  
let hasAutoZoomed  = false;
let userMovedView  = false; 
let lastTargetPinId = null;

/* === Mobil klavye offset + input olayları (korumalı) === */
if (formEl && inputEl && outEl) {
  const vv = window.visualViewport;
  function updateKBOffset(){
    if (!vv) return;
    const kb = Math.max(0, (window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', kb + 'px');
  }
  if (vv){
    vv.addEventListener('resize', updateKBOffset);
    vv.addEventListener('scroll', updateKBOffset);
    updateKBOffset();
  }
  inputEl.addEventListener('focus', ()=>{ formEl.classList.add('active'); outEl.classList.add('active'); updateKBOffset(); });
  inputEl.addEventListener('blur',  ()=>{ formEl.classList.remove('active'); outEl.classList.remove('active'); document.documentElement.style.removeProperty('--kb'); });
  // Enter'a basıldığında: formu gönder, klavyeyi kapat (blur)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputEl.blur();
      if (formEl.requestSubmit) formEl.requestSubmit();
      else formEl.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
}
/* ====== VIEWBOX ====== */
function setVB(x,y,w,h){ vX=x; vY=y; vW=w; vH=h; if(svgEl) svgEl.setAttribute('viewBox',`${vX} ${vY} ${vW} ${vH}`); renderPins(); }
function fit(){
  const W=wrap.clientWidth,H=wrap.clientHeight, rBox=W/H, rMap=vbW0/vbH0;
  if(rBox>rMap){ const w=vbH0*rBox, x=vbX0-(w-vbW0)/2; setVB(x,vbY0,w,vbH0); }
  else{ const h=vbW0/rBox, y=vbY0-(h-vbH0)/2; setVB(vbX0,y,vbW0,h); }
}
function scr2map(sx,sy){ const W=wrap.clientWidth,H=wrap.clientHeight; return [vX+(sx/W)*vW, vY+(sy/H)*vH]; }
function map2scr(mx,my){ const W=wrap.clientWidth,H=wrap.clientHeight; return [ (mx - vX)/vW * W, (my - vY)/vH * H ]; }
function zoomAt(sx, sy, f){
  const [mx, my] = scr2map(sx, sy);
  let candW = Math.min(vbW0 * 10, vW / f);
  const minW = Math.max(vbW0 * 0.05, AUTOLOCK_MIN_W ?? 0);
  const newW = Math.max(minW, candW);
  const newH = newW * (vH / vW);
  const nx = mx - (sx / wrap.clientWidth)  * newW;
  const ny = my - (sy / wrap.clientHeight) * newH;
  setVB(nx, ny, newW, newH);
}
function panBy(dx, dy){
  const W = wrap.clientWidth, H = wrap.clientHeight;
  const nx = vX - (dx / W) * vW;
  const ny = vY - (dy / H) * vH;
  setVB(nx, ny, vW, vH);
}

// 1..20 → hedef viewBox genişliği (vW) eşlemesi
function clampZoomLevel(l){
  const n = parseInt(l,10);
  return Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 5;
}
function levelToTargetW(level){
  const L = clampZoomLevel(level);
  const minW = vbW0 / 20;   // 20 aynı kalsın
  const maxW = vbW0 / 1.3;  // 1. seviye daha uzak (önce: /2.2)
  const t = (L - 1) / 19;   // 0..1
  return maxW + (minW - maxW) * t;
}



/* ====== DATA ====== */
let PINS = [];
let TYPES = {};

async function loadPins(){
  const url = 'data/pins.json?v=' + Date.now();
  const res = await fetch(url,{cache:'no-cache'});
  const arr = await res.json();
  const toCoord = (p) => {
    if (Array.isArray(p.coord)) return p.coord;
    if (Array.isArray(p.percent)) return [vbX0 + vbW0*p.percent[0], vbY0 + vbH0*p.percent[1]];
    return null;
  };
  PINS = arr.map(p => ({...p, coord: toCoord(p)}));
}
async function loadTypeMap(){
  try {
    // Önce panel API’si
    let res = await fetch('/api/types.php?v=' + Date.now(), { cache: 'no-cache' });
    if (res.ok) {
      TYPES = await res.json();
    } else {
      // Olmazsa eski JSON
      res = await fetch('data/pin-types.json?v=' + Date.now(), { cache: 'no-cache' });
      TYPES = await res.json();
    }
  } catch {
    const res = await fetch('data/pin-types.json?v=' + Date.now(), { cache: 'no-cache' });
    TYPES = await res.json();
  }

  // Varsayılan bayrakları tamamla
  if (TYPES && typeof TYPES === 'object') {
    Object.keys(TYPES).forEach(k => {
      const t = TYPES[k] || {};
// Eski bayraklar kalsın ama yeni modele geçiyoruz
if (typeof t.zoomLevel === 'undefined') t.zoomLevel = 6; // geriye dönük

// Yeni alanlar
if (typeof t.size       === 'undefined') t.size       = 10;
if (typeof t.iconZoom   === 'undefined') t.iconZoom   = Math.max(1, (t.zoomLevel ?? 6) - 2);
if (typeof t.nameZoom   === 'undefined') t.nameZoom   = (t.zoomLevel ?? 6);
if (typeof t.actionZoom === 'undefined') t.actionZoom = t.nameZoom ?? (t.zoomLevel ?? 6);

// Sınırlar
t.size       = Math.min(20, Math.max(1, parseInt(t.size,10)       || 10));
t.iconZoom   = Math.min(20, Math.max(1, parseInt(t.iconZoom,10)   || 4));
t.nameZoom   = Math.min(20, Math.max(1, parseInt(t.nameZoom,10)   || 6));
t.actionZoom = Math.min(20, Math.max(1, parseInt(t.actionZoom,10) || (t.nameZoom || 6)));

// Kural: ikon zoomu < isim zoomu
if (t.iconZoom >= t.nameZoom) t.iconZoom = Math.max(1, t.nameZoom - 1);

    });
  }
}
function typeColor(t){ return (TYPES[t] && TYPES[t].color) ? TYPES[t].color : '#2f3e46'; }
function iconPath(t){ return (TYPES[t] && TYPES[t].icon) ? TYPES[t].icon : ''; }


async function loadMap(svgFile){
  const txt = await fetch(svgFile + '?v=' + Date.now(), { cache:'no-cache' })
.then(r=>r.text());
  mount.innerHTML = txt;

  svgEl = mount.querySelector('svg');
  if(!svgEl) throw new Error('SVG bulunamadı');

  const vb = svgEl.getAttribute('viewBox');
  if (vb){ [vbX0,vbY0,vbW0,vbH0] = vb.trim().split(/\s+/).map(Number); }
  else {
    const w = parseFloat(svgEl.getAttribute('width'))||1000;
    const h = parseFloat(svgEl.getAttribute('height'))||1000;
    vbX0=0; vbY0=0; vbW0=w; vbH0=h;
    svgEl.setAttribute('viewBox',`0 0 ${w} ${h}`);
  }
  svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
	svgEl.style.width = '100%';
svgEl.style.height = '100%';
svgEl.style.display = 'block';
svgEl.style.position = 'absolute';
svgEl.style.inset = '0';
svgEl.setAttribute('preserveAspectRatio','xMidYMid meet');

/* İlk layout’tan sonra bir kez daha fit et */
requestAnimationFrame(()=>{ fit(); });

  // Seçim/drag/callout engelleme (senin kodundaki aynı korumalar)
  svgEl.setAttribute('draggable','false');
  svgEl.style.webkitUserSelect = 'none';
  svgEl.style.userSelect = 'none';
  svgEl.style.webkitTouchCallout = 'none';
  svgEl.style.webkitTapHighlightColor = 'transparent';
  mount.addEventListener('selectstart', e=>e.preventDefault(), { passive:false });
  mount.addEventListener('dragstart',   e=>e.preventDefault(), { passive:false });
  mount.addEventListener('contextmenu', e=>e.preventDefault(), { passive:false });

// İlk layout’tan sonra fit + sonra zoom (fit'in EZMESİ için aynı RAF içinde)
requestAnimationFrame(() => {
  fit();

  // 🔸 Yakınlığı BURADAN ayarla
  if (window.innerWidth < 768) {
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;

    // 1) Oran ile: 1.0=hiç, 1.25=%25, 2=2x, 10=10x
    zoomAt(cx, cy, 1.5);

    // Harita aşağıda kalıyorsa biraz yukarı kaydır
    panBy(-wrap.clientWidth * 0.014, 0);
  }
});

// 🔹 Mobilde ilk açılışta otomatik hafif yakınlaştırma (1.25x)
if (window.innerWidth < 768) {
  // wrap alanının ortası
  const cx = wrap.clientWidth / 2;
  const cy = wrap.clientHeight / 2;

  // 1.25x yakınlaştırma
  zoomAt(cx, cy, 1.25);

  // ufak offset ekle (harita aşağıda kalmasın)
  panBy(0, -wrap.clientHeight * 0.05);
}

  // Tip haritası ve pinler (ilk açılışta zaten yüklenmiş olabilir; yine de güvenli)
  if (!Object.keys(TYPES).length) await loadTypeMap();
  if (!PINS.length) await loadPins();
  initPins();     // pin DOM’u yeniden kur
  renderPins();   // konumları yeniden hesapla
}

// İlk yükleme: AÇIK tema
loadMap('acik.svg').catch(console.error);


wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  userMovedView = true;
  const r=wrap.getBoundingClientRect();
  const sx=e.clientX - r.left, sy=e.clientY - r.top;
  const f=Math.exp(-e.deltaY*(e.ctrlKey?0.8:0.18)/100);
  zoomAt(sx, sy, f);
},{passive:false});


let drag=false, anchorAX=0, anchorAY=0;
wrap.addEventListener('mousedown',e=>{
  drag=true; const r=wrap.getBoundingClientRect();
  const sx=e.clientX - r.left, sy=e.clientY - r.top; [anchorAX, anchorAY] = scr2map(sx, sy);
});
window.addEventListener('mousemove',e=>{
  if(!drag) return; const r=wrap.getBoundingClientRect();
  userMovedView = true;
  const sx=e.clientX - r.left, sy=e.clientY - r.top;
  const newVX = anchorAX - (sx / wrap.clientWidth) * vW;
  const newVY = anchorAY - (sy / wrap.clientHeight) * vH;
  setVB(newVX, newVY, vW, vH);
});
window.addEventListener('mouseup',()=>{ drag=false; });

/* Touch */
const pts=new Map(); let lastD=null;
function dist(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.hypot(dx,dy);}
wrap.addEventListener('pointerdown',e=>{ wrap.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); });
wrap.addEventListener('pointermove',e=>{
  if(!pts.has(e.pointerId)) return;
  const prev=pts.get(e.pointerId), cur={x:e.clientX,y:e.clientY}; pts.set(e.pointerId,cur);
  if(pts.size===1 && prev){ userMovedView = true; panBy(cur.x - prev.x, cur.y - prev.y); return; }
  if(pts.size===2){
    const [A,B]=[...pts.values()];
    const r=wrap.getBoundingClientRect(); const cx=(A.x+B.x)/2 - r.left, cy=(A.y+B.y)/2 - r.top;
    const d=dist(A,B); if(lastD!=null){ userMovedView = true; const factor=Math.max(1/1.03,Math.min(1.03,d/(lastD||1))); zoomAt(cx,cy,factor); }
    lastD=d;
  }
});

function up(e){ pts.delete(e.pointerId); if(pts.size<2) lastD=null; }
wrap.addEventListener('pointerup',up); wrap.addEventListener('pointercancel',up);
window.addEventListener('resize',()=>{ fit(); });

/* ====== PINS ====== */
let pinEls = new Map();

function initPins(){
  pinLay.innerHTML=''; 
  pinEls.clear();

  PINS.forEach(p=>{
    if(!p.coord || p.hidden) return;

const el = document.createElement('button');
el.className = 'pin';
if ((p.labelSide || 'right') === 'left') el.classList.add('label-left');  // <- YENİ
el.type = 'button';
el.dataset.id = p.id;

    el.style.setProperty('--accent', typeColor(p.type));

    const circle = document.createElement('span');
    circle.className = 'circle';

    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    const ipath = iconPath(p.type);
    if (ipath){ glyph.style.setProperty('--icon', `url("${ipath}")`); }
    circle.appendChild(glyph);

const label = document.createElement('span');
label.className = 'label';
label.textContent = (p.title || '');

circle.appendChild(label);


    el.appendChild(circle);

el.addEventListener('click', ()=>{
  lastSearchMeta = null;
  resetRoomHead();
  openInfo(p.id);
  zoomToPin(p); // türün zoomLevel’ine göre
});

    // >>> BU İKİ SATIR SENDE YOKTU: pinleri DOM'a ve haritaya kaydediyoruz
    pinLay.appendChild(el);
    pinEls.set(p.id, el);
  });
}


function renderPins(){
  if (!pinEls.size) return;

  PINS.forEach(p => {
    if (!p.coord || p.hidden) return;

    const el = pinEls.get(p.id);
    if (!el) return;

    const t     = TYPES[p.type] || {};
    const color = (t.color || '#2f3e46');
    const ipath = iconPath(p.type);

    // konum
    const [sx, sy] = map2scr(p.coord[0], p.coord[1]);
    el.style.left = sx + 'px';
    el.style.top  = sy + 'px';
    el.style.setProperty('--accent', color);

    // elemanlar
    const circle = el.querySelector('.circle');
    const glyph  = el.querySelector('.glyph');
    const label  = el.querySelector('.label');

    // renk
    if (circle) circle.style.background = color;

    // --- boyutlandırma (size: 1..20; 10 => 1.0 ölçek) ---
    const sizeK   = Math.max(0.1, (t.size ?? 10) / 10);
    const isDesk  = window.innerWidth >= 768;
    const baseCirc= isDesk ? 24 : 16;
    const baseGly = isDesk ? 15 : 10;
    const baseLeft= isDesk ? 30 : 22;
    const baseFont= isDesk ? 12 : 9;

    if (circle){
      circle.style.width  = (baseCirc * sizeK) + 'px';
      circle.style.height = (baseCirc * sizeK) + 'px';
    }
    if (glyph){
      if (ipath) glyph.style.setProperty('--icon', `url("${ipath}")`);
      else       glyph.style.removeProperty('--icon');
      glyph.style.width  = (baseGly * sizeK) + 'px';
      glyph.style.height = (baseGly * sizeK) + 'px';
    }
if (label){
  label.textContent = p.title || '';
  label.style.color = color;
  label.style.fontSize = (baseFont * sizeK) + 'px';

  const hasNL = /\n/.test(p.title || '');
  label.style.whiteSpace = hasNL ? 'pre-line' : 'nowrap';
  label.style.maxWidth   = hasNL ? '220px'   : 'none';
  label.textContent = p.title || '';
  label.style.whiteSpace = (/\n/.test(p.title || '')) ? 'pre-line' : 'nowrap';
  label.style.maxWidth   = (/\n/.test(p.title || '')) ? '220px' : 'none';

  // tarafa göre sınıfı sürekli güncel tut (dinamik)
  const side = (p.labelSide || 'right');
  el.classList.toggle('label-left', side === 'left');

  // left/right offset
  if (side === 'left'){
    label.style.left  = 'auto';
    label.style.right = (baseLeft * sizeK) + 'px';
    label.style.textAlign = 'right';
  } else {
    label.style.right = 'auto';
    label.style.left  = (baseLeft * sizeK) + 'px';
    label.style.textAlign = 'left';
  }
}
    // --- görünürlük eşikleri ---
    const iconThrW = levelToTargetW(t.iconZoom ?? 4);
    const nameThrW = levelToTargetW(t.nameZoom ?? 6);

    const showIcon = (vW <= iconThrW);
    const showName = (vW <= nameThrW) && ((p.title || '').trim().length > 0);

    if (glyph)  glyph.style.display  = showIcon ? 'block' : 'none';
    if (circle) circle.style.display = showIcon ? 'grid'  : 'none';
    if (label)  label.style.display  = showName ? 'block' : 'none';
  });
}


/* ====== HELPERS ====== */
	// H, L, K, M, N, P, R blok biçimleri (H-101, H A05, h101, h-a05 ...)
function isHLKMNPRQuery(q){
  const s = (q||'').trim().toUpperCase().replace(/\s+/g,' ');
  // 3 haneli: H-101  |  Harf+2 hane: H-A05
  // Aradaki - veya boşluk opsiyonel olsun
  // Örn: H101, H 101, H-101, H A05, H-A05
  return /^([HLKMNPR])(?:[\s-])?((?:\d{3})|(?:[A-Z][\s-]?\d{2}))$/.test(s);
}

function buildHLKMNPRMeta(q){
  // “H-101” → H Blok, 1. Kat, H-101
  // “H-A05” → H Blok, A Katı, H-A05
  const raw = (q||'').trim().toUpperCase().replace(/\s+/g,' ');
  const m = raw.match(/^([HLKMNPR])(?:[\s-])?((?:\d{3})|(?:[A-Z][\s-]?\d{2}))$/);
  if(!m){
    return { ok:false, input: raw };
  }
  const blk = m[1];
  let tail  = m[2].replace(/-/g,'');

  let floor = null;           // sayı ise buraya
  let floorLabel = null;      // harf ise buraya (tek harf!)
  let displayRoomText = null; // H-101 / H-A05

  if (/^\d{3}$/.test(tail)){
    // 3 hane: ilk hane sayısal kat
    floor = parseInt(tail[0], 10);
    displayRoomText = `${blk}-${tail}`;
  } else {
    // Harf + 2 hane: tek harf kat etiketi
    const L = tail[0].toUpperCase();          // A/B/C...
    const nn = tail.slice(1).padStart(2,'0'); // 05
    floorLabel = L;                            // <-- SADECE HARF
    displayRoomText = `${blk}-${L}${nn}`;     // H-A05
  }

  return {
    ok:true,
    method:'hlkmnpr-override',
    block: blk.toLowerCase(),

    floor,            // sayı (örn 1)
    floorLabel,       // tek harf (örn 'A')
    room: null,
    roomCode: null,
    displayRoomText,  // H-101 / H-A05
    input: raw
  };
}

function escapeHTML(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function autoLink(text){
  const safe = escapeHTML(text||'');
  const urlRe = /\b((?:https?:\/\/|www\.)[^\s<]+)/gi;
  return safe.replace(urlRe, (m)=>{
    const href = m.startsWith('http') ? m : 'http://' + m;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow ugc">${m}</a>`;
  });
}
function ltrimOneLeadingBlank(text){ if (!text) return ''; return text.replace(/^\s*\n?/, ''); }

/* ====== INFO SHEET ====== */
let activeInfoPinId = null;

function openInfo(id){
  const p = PINS.find(x=>x.id===id);
  if(!p) return;
  if (outEl) outEl.textContent = ''; 
  updateRoomHead(lastSearchMeta);
  const rawTitle = (p.title || '').trim();
  const rawSub   = (p.subTitle || p.subtitle || p.sub || '').trim();
  const rawDesc  = (p.desc || p.description || '').trim();

  const titleOut = rawTitle || rawSub;

  if (titleOut){ iTitle.textContent = titleOut; iTitle.style.display = 'block'; }
  else { iTitle.textContent = ''; iTitle.style.display = 'none'; }

  if (rawSub && !rawTitle){ iSub.textContent = ''; iSub.style.display = 'none'; }
  else if (rawSub){ iSub.textContent = rawSub; iSub.style.display = 'block'; }
  else { iSub.textContent = ''; iSub.style.display = 'none'; }

  if (rawDesc){
    const cleaned = ltrimOneLeadingBlank(rawDesc);
    iDescText.innerHTML = autoLink(cleaned);
    iDesc.style.display = 'block';
  } else {
    iDescText.innerHTML = '';
    iDesc.style.display = 'none';
    iDesc.classList.remove('collapsed');
  }

  openSheet();
  setCollapsed();
  justOpenedAt = performance.now();
  checkDescOverflow();

  activeInfoPinId = id;
  hideOtherPins(id);

  pinEls.forEach(el => el.classList.remove('active'));
  const el = pinEls.get(id);
  if (el) el.classList.add('active');
}

function closeSheet(){
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden','true');
  activeInfoPinId = null;
  restoreAllPins();
  pinEls.forEach(el => el.classList.remove('active'));
  sheetState = 'closed';
	  AUTOLOCK_MIN_W = null;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

document.addEventListener('pointerdown', (e) => {
  const insideSheet = sheet.contains(e.target);
  const onPin = e.target.closest?.('.pin');
  if (!insideSheet && !onPin) {
    if (sheetState === 'expanded') setCollapsed();
    else if (sheetState === 'collapsed') closeSheet();

    // >>> YENİ: boş alana tıklandıysa “oto-zoom kilidi”ni kaldır
    // Böylece tekerlek / pinch ile yeniden zoom yapılabilir.
    AUTOLOCK_MIN_W = null;
  }
});


function setCollapsed(){
  iDesc.classList.add('collapsed');
  contentEl.scrollTop = 0;
  sheetState = 'collapsed';
  checkDescOverflow();
}
function setExpanded(){
  iDesc.classList.remove('collapsed','show-more');
  let html = iDescText.innerHTML;
  html = html.replace(/^(\s|&nbsp;|&#160;)+/i, '').replace(/^<(br|BR)\s*\/?>\s*/g, '');
  iDescText.innerHTML = html;
  sheetState = 'expanded';
}
function openSheet(){ sheet.classList.add('open'); sheet.setAttribute('aria-hidden','false'); }

function hideOtherPins(keepId){ pinEls.forEach((el, id)=>{ if (id !== keepId) el.classList.add('hidden'); else el.classList.remove('hidden'); }); }
function restoreAllPins(){ pinEls.forEach((el)=> el.classList.remove('hidden')); }

iDesc.addEventListener('click', () => { if (sheetState === 'collapsed') setExpanded(); });
contentEl.addEventListener('scroll', () => {
  const now = performance.now();
  if (now - justOpenedAt < 200) return;
  if (sheetState === 'collapsed' && contentEl.scrollTop > 24) setExpanded();
});
function checkDescOverflow(){
  if(!iDesc.classList.contains('collapsed')){ iDesc.classList.remove('show-more'); return; }
  requestAnimationFrame(()=>{ const overflow = iDesc.scrollHeight > iDesc.clientHeight + 1; iDesc.classList.toggle('show-more', overflow); });
}
iMore.addEventListener('click', (e)=>{ e.preventDefault(); if (sheetState === 'collapsed'){ setExpanded(); iDesc.classList.remove('show-more'); } });
window.addEventListener('resize', ()=>{ if (sheetState === 'collapsed') checkDescOverflow(); });

const FLOOR_MAP = { a:0, b:-1, c:-2, d:-3, z:0 };
const FACULTY_PRIORITY = ['hukuk','mimarlık'];
const BLOCK_FACULTY_HINT = { 'b': 'mimarlık' };
const FACULTY_ALIASES = {
  'hukuk':     ['huk', 'huku', 'hukuk'],
  'mimarlık':  ['mi','mim', 'mima', 'mimar', 'mimarlik', 'mimarlık']
};
/* ====== FAKÜLTE TABANLI ARAMA ====== */
const FACULTY_WORDS = {
  'hukuk':     ['hukuk','huk','huku'],
  'mimarlık':  ['mimarlık','mimarlik','mim','mimar','mi']
};
const FACULTY_TO_BLOCK = { 'hukuk': 'a', 'mimarlık': 'b' };
// --- HUKUK KAT DÖNÜŞÜMÜ (yalnız b, z, 1..6 geçerli) ---
// - Letter 'B'  => kat = -1, görüntü: "bXX"
// - Letter 'Z'  => kat =  0, görüntü: "zXX"
// - Digit 1..6  => kat = aynı, görüntü: "1XX", "2XX" ...
// - Diğer harfler (A,C,D vs.) => GEÇERSİZ (bulunamasın)
function hukukNormalizeKat({ floor, floorLabel, room }) {
  const rm = (room != null) ? String(room).padStart(2,'0') : null;

  // Harfli ifade geldiyse sadece B/Z izinli
  if (floorLabel != null) {
    const L = String(floorLabel).toUpperCase();
    if (L === 'B') {
      return { floor: -1, floorLabel: null, displayRoomText: (rm ? `b${rm}` : null) };
    }
    if (L === 'Z') {
      return { floor: 0, floorLabel: 'Z', displayRoomText: (rm ? `z${rm}` : null) };
    }
    // A, C, D ... -> geçersiz
    return { invalid: true };
  }

  // Sayısal geldiyse yalnız 1..6
  if (typeof floor === 'number') {
    if (floor >= 1 && floor <= 6) {
      return { floor, floorLabel: null, displayRoomText: (rm ? `${floor}${rm}` : null) };
    }
    return { invalid: true };
  }

  // Kat bilgisi yoksa da geçersiz (Hukuk oda aramasında mutlaka b/z/1..6 ile gelir)
  return { invalid: true };
}

function hasFacultyWord(q, fac){
  const s = normalizeStr(q);
  return (FACULTY_WORDS[fac]||[]).some(w => new RegExp(`\\b${w}\\b`).test(s));
}

// Örnekler: "Hukuk A12", "Hukuk B08", "Hukuk-Mimarlık B08", "Hukuk Mimarlık B-08", "Hukuk B08"
// "Bina Hukuk Fakültesi" → sadece binayı aç
function parseFacultyQuery(q){
  const s = normalizeStr(q);
  const hasH = hasFacultyWord(q, 'hukuk');
  const hasM = hasFacultyWord(q, 'mimarlık');
  if (!hasH && !hasM) return { ok:false };

  // Sadece bina açma
  if (/\bbina\b.*\bhukuk\b/.test(s)) {
    return { ok:true, method:'faculty-building', faculty:'hukuk', block:'a', blockLabel:'Hukuk Fakültesi' };
  }
  if (/\bbina\b.*\bmimarl[ıi]k\b/.test(s)) {
    return { ok:true, method:'faculty-building', faculty:'mimarlık', block:'b', blockLabel:'Mimarlık Fakültesi' };
  }

  // Hukuk/Mimarlık oda kodu yakalama:
  //   - Hukuk için SADECE: bXX, zXX, 1XX..6XX (ör: b08, z05, 105, 312)
  //   - Mimarlık için mevcut kurallar (A/B/C/D/1..5) devam (değiştirmiyoruz)
  const m = s.match(/\b([a-z0-9])[ \-]?(\d{2})\b/i);
  if (!m) {
    // kod yoksa sadece ilgili binayı aç
    const faculty = hasH ? 'hukuk' : 'mimarlık';
    return {
      ok:true, method:'faculty-building',
      faculty, block: FACULTY_TO_BLOCK[faculty],
      blockLabel: faculty==='hukuk' ? 'Hukuk Fakültesi' : 'Mimarlık Fakültesi'
    };
  }

  let fch = m[1];  // harf ya da rakam
  const rm  = m[2]; // 2 hane oda

  let faculty = hasH ? 'hukuk' : 'mimarlık';
  const block   = FACULTY_TO_BLOCK[faculty];

  // Ortak alanlar
  let floor      = null;
  let floorLabel = null;
  let displayRoomText = null;

  if (faculty === 'hukuk') {
    // ——— HUKUK: Yalnız b, z, 1..6 kabul ———
    const isLetter = /^[a-z]$/.test(fch);
    if (isLetter) {
      const L = fch.toLowerCase();
      if (L === 'b') {
        const tr = hukukNormalizeKat({ floor: null, floorLabel: 'B', room: rm });
        if (tr.invalid) return { ok:false, reason:'Hukuk için geçersiz kat' };
        floor = tr.floor; floorLabel = tr.floorLabel; displayRoomText = tr.displayRoomText; // "b08"
      } else if (L === 'z') {
        const tr = hukukNormalizeKat({ floor: null, floorLabel: 'Z', room: rm });
        if (tr.invalid) return { ok:false, reason:'Hukuk için geçersiz kat' };
        floor = tr.floor; floorLabel = tr.floorLabel; displayRoomText = tr.displayRoomText; // "z05"
      } else {
        // a/c/d vb. yasak
        return { ok:false, reason:'Hukuk için yalnız b, z, 1..6' };
      }
    } else {
      // Rakam başlangıcı
      const n = parseInt(fch, 10);
      const tr = hukukNormalizeKat({ floor: n, floorLabel: null, room: rm });
      if (tr.invalid) return { ok:false, reason:'Hukuk için yalnız b, z, 1..6' };
      floor = tr.floor; floorLabel = tr.floorLabel; displayRoomText = tr.displayRoomText; // "105" vb.
    }

    const labelForCode = (floorLabel != null) ? floorLabel : (floor != null ? String(floor) : '');
    return {
      ok:true,
      method:'faculty-room',
      faculty, block,
      blockLabel:'Hukuk Fakültesi',
      floor, floorLabel,
      room: rm,
      roomCode: displayRoomText || `${labelForCode}${rm}`,
      displayRoomText: displayRoomText || `${labelForCode}${rm}` // ÇİPTE AYNEN görünür (b08, z05, 105...)
    };
  }

  // ——— MİMARLIK: önceki davranış korunuyor ———
  // (A/B/C/D veya 1..5 formatları)
  if (/^[a-d]$/i.test(fch)) {
    const L = fch.toUpperCase();
    if (!ALLOWED_LETTER_FLOORS.has(L)) return { ok:false, reason:'Geçersiz kat' };
    floorLabel = L;
  } else if (/^\d$/.test(fch)) {
    const n = parseInt(fch, 10);
    if (!ALLOWED_NUM_FLOORS.has(n)) return { ok:false, reason:'Geçersiz kat' };
    floor = n;
  } else {
    return { ok:false };
  }

  const label = (floorLabel != null) ? floorLabel : (floor != null ? String(floor) : '');
  return {
    ok:true,
    method:'faculty-room',
    faculty:'mimarlık', block,
    blockLabel:'Mimarlık Fakültesi',
    floor, floorLabel,
    room: rm,
    roomCode: `${label}${rm}`,
    displayRoomText: `${label}${rm}`
  };
}
function normalizeStr(s){
  return (s||'').toLowerCase().replace(/[^a-z0-9çğıöşü\-\_\s]/g,' ').replace(/\s+/g,' ').trim();
}
function normalizeCompact(s){ return (s||'').toLowerCase().replace(/[^a-z0-9çğıöşü]/g,''); }
function normalizeForMatch(s){ return normalizeStr(s).replace(/\s+/g,' ').trim(); }
function fieldHasPrefix(field, prefix){ if(!field) return false; const f = normalizeForMatch(field); return f.startsWith(prefix); }
// "G.O.P", "g o p", "gop" → "gop"
function normalizeAbbrev(s){
  return (s||'').toLowerCase().replace(/[^a-z0-9çğıöşü]/g, '');
}

// Başlıklarda (title/type/desc) hem normal hem "noktalı kısaltma" ön-ek eşleşmesi
function titlePrefixMatch(title, q){
  if (!title || !q) return false;
  const t1 = normalizeForMatch(title);
  const q1 = normalizeForMatch(q);
  if (t1.startsWith(q1)) return true;

  const t2 = normalizeAbbrev(title);
  const q2 = normalizeAbbrev(q);
  return t2.startsWith(q2);
}

// Önce başlığa bak; bulunamazsa type/desc dener
function findPinByTitleSmart(q){
  const want = (q||'').trim();
  if (!want) return null;

  let cand = PINS.find(p => titlePrefixMatch(p.title, want));
  if (cand) return cand;

  cand = PINS.find(p => titlePrefixMatch(p.type, want));
  if (cand) return cand;

  cand = PINS.find(p => titlePrefixMatch(p.desc, want));
  if (cand) return cand;

  return null;
}
	// Başlığı token'lara ayır: noktalı kısaltmalar ve tireler birleştirilmiş hali dahil
function titleTokens(title){
  const s = (title||'').toLowerCase();
  // harf/rakam + . ve - içeren parçaları yakala (G.O.P, Eryaman-1-2 vb.)
  const parts = s.match(/[a-zçğıöşü0-9\.\-]+/gi) || [];
  const set = new Set();

  parts.forEach(p=>{
    // 1) İçinde . ve -'leri tamamen kaldırıp ekle → "G.O.P" → "gop"
    const joined = p.replace(/[^a-zçğıöşü0-9]+/gi,'');
    if (joined) set.add(joined);

    // 2) Tireyi boşluğa çevirip alt parçaları da ekle → "1-2" → "1","2"
    const dehyphen = p.replace(/[\-]+/g,' ').trim();
    if (dehyphen){
      dehyphen.split(/\s+/).forEach(w=>{ if (w) set.add(w); });
    }
  });

  // 3) Tüm başlığın “sembolsüz” birleşik hali de kalsın (tam eşitlik için)
  const fullJoined = (title||'').toLowerCase().replace(/[^a-z0-9çğıöşü]+/g,'');
  if (fullJoined) set.add(fullJoined);

  return set;
}

// Sorgu, başlık token'larından **biriyle** (sembolsüz) tam eşleşirse pini döndür
function findPinByTitleExactToken(q){
  const k = normalizeAbbrev(q); // "G.O.P", "g o p" → "gop", "Esat" → "esat"
  if (!k) return null;
  return PINS.find(p => {
    const set = titleTokens(p.title||'');
    return set.has(k);
  }) || null;
}


/* mescit çoklu zoom */
function isMescitQuery(q){ const s = normalizeStr(q); return /\bmescit|cami\b/.test(s); }
function pinIsMescit(p){ const t = normalizeForMatch((p.type||'')+' '+(p.title||'')+' '+(p.desc||'')); return /\bmescit|cami\b/.test(t); }
function zoomToBounds(minX,minY,maxX,maxY,paddingRatio=0.1,duration=2000){
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);

  // 1) Padding
  let bx = minX - w*paddingRatio;
  let by = minY - h*paddingRatio;
  let bw = w*(1+2*paddingRatio);
  let bh = h*(1+2*paddingRatio);

  // 2) En fazla yakınlaşmayı sınırla (harita kaybolmasın)
  //    Mobil: biraz daha uzak, Desktop: daha da uzak
  const MIN_W = (window.innerWidth < 768) ? (vbW0/3.2) : (vbW0/4.2);
  if (bw < MIN_W){
    // kutuyu merkezde büyüt
    const cx = bx + bw/2;
    const cy = by + bh/2;
    const k  = MIN_W / bw;
    bw = MIN_W;
    bh = bh * k;
    bx = cx - bw/2;
    by = cy - bh/2;
  }

  // 3) Ekran oranına uydur
  const rBox = wrap.clientWidth / wrap.clientHeight;
  const rSel = bw / bh;
  if (rSel > rBox){
    const needBh = bw / rBox;
    const d = needBh - bh;
    by -= d/2; bh = needBh;
  } else {
    const needBw = bh * rBox;
    const d = needBw - bw;
    bx -= d/2; bw = needBw;
  }

  // 4) Kenarlara çarpmayı engelle
  bx = Math.max(vbX0, Math.min(bx, vbX0 + vbW0 - bw));
  by = Math.max(vbY0, Math.min(by, vbY0 + vbH0 - bh));

  animateVBTo(bx, by, bw, bh, duration);
}

const ALLOWED_NUM_FLOORS = new Set([1,2,3,4,5]);
const ALLOWED_LETTER_FLOORS = new Set(['A','B','C','D']);

/* ==== YDB: kat sınırı (yalnız Z,1,2,3) ==== */
const YDB_ALLOWED_NUM_FLOORS = new Set([1,2,3]);
const YDB_ALLOWED_LETTER_FLOORS = new Set(['Z']);
function isFloorAllowedForMimarlik(meta){
  if (!meta) return false;
  // Harf kat: sadece A,B,C,D
  if (meta.floorLabel != null) {
    return ['A','B','C','D'].includes(String(meta.floorLabel).toUpperCase());
  }
  // Sayı kat: 1..6
  if (meta.floor != null) {
    return [1,2,3,4,5,6].includes(Number(meta.floor));
  }
  return false;
}

function isYDBFloorAllowed(meta){
  if (!meta) return false;
  if (meta.floor != null)      return YDB_ALLOWED_NUM_FLOORS.has(meta.floor);
  if (meta.floorLabel != null) return YDB_ALLOWED_LETTER_FLOORS.has(String(meta.floorLabel).toUpperCase());
  return false;
}

function isHLKMNPRQuery(q){
  const s = (q||'').trim().toUpperCase();
  // H-101 / H101  veya  H-A05 / H A05
  return /^[HLKMNPR][\s-]?((\d{3})|([A-D][\s-]?\d{2}))$/.test(s);
}

// “H-101” → floor=1   |  “H-A05” → floorLabel='A'
function buildHLKMNPRMeta(q){
  const raw = (q||'').trim().toUpperCase().replace(/\s+/g,' ');
  const m = raw.match(/^([HLKMNPR])(?:[\s-])?((?:\d{3})|(?:[A-Z][\s-]?\d{2}))$/);
  if(!m) return { ok:false, input: raw };

  const blk = m[1];
  let tail  = m[2].replace(/-/g,'');

  let floor = null;           // sayı kat (1..6)
  let floorLabel = null;      // harf kat (A..D)
  let displayRoomText = null; // H-101 / H-A05

  if (/^\d{3}$/.test(tail)){
    floor = parseInt(tail[0], 10);
    displayRoomText = `${blk}-${tail}`;
  } else {
    const L = tail[0].toUpperCase();
    const nn = tail.slice(1).padStart(2,'0');
    floorLabel = L;
    displayRoomText = `${blk}-${L}${nn}`;
  }

  return {
    ok:true,
    method:'hlkmnpr-override',
    block: blk.toLowerCase(),
    blockLabel: `${blk} Blok`,
    floor,
    floorLabel,
    room:null,
    roomCode:null,
    displayRoomText,
    input: raw
  };
}

function isFloorAllowedForHLKMNPR(meta){
  if (!meta) return false;
  if (meta.floor != null)       return ALLOWED_NUM_FLOORS.has(meta.floor);
  if (meta.floorLabel != null)  return ALLOWED_LETTER_FLOORS.has(String(meta.floorLabel).toUpperCase());
  return false;
}

function capFirst(s){ return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }
function inferBlockFromPin(p){
  const t = normalizeStr(p.title||'');
  const m = t.match(/\b([a-z])\s*blok\b/);
  return m ? m[1].toUpperCase() : null;
}
function formatFloorLabel(meta){
  if (!meta) return null;
  // Harf kat: A/B/C/Z → "A Katı"
  if (meta.floorLabel && /^[A-ZÇĞİÖŞÜ]$/.test(meta.floorLabel)) return `${meta.floorLabel} Katı`;
  // Sayı kat: 1/2/3 → "1. Kat"
  if (typeof meta.floor === 'number') return `${meta.floor}. Kat`;
  return null;
}

function formatRoomLabel(meta, blockLabel){
  if (!meta) return null;

  const fl = (meta.floorLabel ?? (typeof meta.floor === 'number' ? String(meta.floor) : '')).toUpperCase();
  const rm = (meta.room != null) ? String(meta.room).padStart(2,'0') : null;

  // 0) Hukuk (A Blok): blok adı ASLA yazma → "105" gibi düz
  if (blockLabel === 'A' && fl && rm){
    return `${fl}${rm} sınıfı`;
  }

  // 1) B ve C blok: sadece üç hane göster
  if ((blockLabel === 'B' || blockLabel === 'C') && fl && rm){
    return `${fl}${rm} sınıfı`;
  }

  // 2) Eğer meta.displayRoomText varsa onu kullan (örn: "L-205")
  if (meta.displayRoomText && (meta.displayRoomText + '').trim().length > 0){
    return `${meta.displayRoomText} sınıfı`;
  }

  // 3) L-A25 gibi kod varsa kodu aynen yaz
  if (meta.roomCode && /^[A-Z]-[A-Z]\d{2}$/.test(meta.roomCode)){
    return `${meta.roomCode} sınıfı`;
  }

  // 4) A/B/C dışındaki bloklar (H, K, L, M, N, P, R) için "L-205" biçimi
  if (blockLabel && !['A','B','C'].includes(blockLabel) && fl && rm){
    return `${blockLabel}-${fl}${rm} sınıfı`;
  }

  // 5) Harf-kat (z05, b12 vs) genel kural (blok harfi yoksa)
  if (fl && /^[A-ZÇĞİÖŞÜ]$/.test(fl) && rm){
    return `${fl}${rm} sınıfı`;
  }

  // 6) 3 haneli default durum
  if (typeof meta.floor !== 'undefined' && rm){
    return `${fl}${rm} sınıfı`;
  }

  // 7) Sadece oda biliniyorsa
  if (meta.room != null){
    return `${String(meta.room)} sınıfı`;
  }
  return null;
}
function updateRoomHead(meta){
  if (!roomHead) return;

  // Meta yoksa tamamen gizle
  const hasAnyInfo = !!(meta && (
    meta.block || meta.blockLabel ||
    typeof meta.floor === 'number' || meta.floorLabel ||
    meta.displayRoomText || typeof meta.room === 'number'
  ));
  if (!hasAnyInfo){
    resetRoomHead();
    return;
  }
	// Ortak alan bilgisini pin AÇMADAN gösterir (rozetler + sheet)
function openSharedArea(meta, opts = {}){
  lastSearchMeta = meta && meta.ok ? meta : null;
  updateRoomHead(meta);

  const t = (opts.title || 'Ortak Alan').trim();
  const s = (opts.sub   || 'H Blok').trim();
  const d = (opts.desc  || '').trim();

  if (t){ iTitle.textContent = t; iTitle.style.display = 'block'; } else { iTitle.textContent=''; iTitle.style.display='none'; }
  if (s){ iSub.textContent   = s; iSub.style.display   = 'block'; } else { iSub.textContent  = ''; iSub.style.display  = 'none'; }

  if (d){
    iDescText.innerHTML = autoLink(d.replace(/^\s*\n?/, ''));
    iDesc.style.display = 'block';
  } else {
    iDescText.innerHTML = '';
    iDesc.style.display = 'none';
    iDesc.classList.remove('collapsed');
  }

  restoreAllPins();
  pinEls.forEach(el => el.classList.remove('active'));

  openSheet();
  setCollapsed();
  justOpenedAt = performance.now();
  checkDescOverflow();
}

// --- Ortak alan bilgisini pin AÇMADAN göster (rozetli chip bar + başlık/alt başlık/desc) ---
function openSharedArea(meta, opts = {}){
  // Chip bar’ı doldur
  lastSearchMeta = meta && meta.ok ? meta : null;
  updateRoomHead(meta);

  // Başlık/alt başlık/açıklama
  const t = (opts.title || 'Ortak Alan').trim();
  const s = (opts.sub   || '').trim();
  const d = (opts.desc  || '').trim();

  if (t){ iTitle.textContent = t; iTitle.style.display = 'block'; } else { iTitle.textContent=''; iTitle.style.display='none'; }
  if (s){ iSub.textContent   = s; iSub.style.display   = 'block'; } else { iSub.textContent  = ''; iSub.style.display  = 'none'; }

  if (d){
    const cleaned = d.replace(/^\s*\n?/, '');
    iDescText.innerHTML = autoLink(cleaned);
    iDesc.style.display = 'block';
  } else {
    iDescText.innerHTML = '';
    iDesc.style.display = 'none';
    iDesc.classList.remove('collapsed');
  }

  // Pinleri gizleme/aktiflik sıfırla
  restoreAllPins();
  pinEls.forEach(el => el.classList.remove('active'));

  // Sheet’i aç
  openSheet();
  setCollapsed();
  justOpenedAt = performance.now();
  checkDescOverflow();
}

  // Önce temizle
  rhBlock.textContent = ''; rhBlock.hidden = true;
  rhFloor.textContent = ''; rhFloor.hidden = true;
  rhRoom.textContent  = ''; rhRoom.hidden  = true;

  // BLOK
  if (meta.blockLabel){
    const isSingleLetter = /^[A-ZÇĞİÖŞÜ]$/.test(String(meta.blockLabel));
    const blockText = isSingleLetter ? `${meta.blockLabel} Blok` : String(meta.blockLabel);
    rhBlock.textContent = blockText.trim();
    rhBlock.hidden = (rhBlock.textContent.length === 0);
  }

  // KAT
  const fl = formatFloorLabel(meta);
  if (fl){
    rhFloor.textContent = String(fl).trim();
    rhFloor.hidden = (rhFloor.textContent.length === 0);
  }

  // SINIF
  if (meta.displayRoomText){
    rhRoom.textContent = String(meta.displayRoomText).trim();
    rhRoom.hidden = (rhRoom.textContent.length === 0);
  } else {
    const rm = formatRoomLabel(meta, meta.blockLabel || null);
    if (rm){
      rhRoom.textContent = String(rm).trim();
      rhRoom.hidden = (rhRoom.textContent.length === 0);
    }
  }
// --- Hukuk & Mimarlık için sınıf kodundaki harfleri büyük yap (b05 -> B05, z12 -> Z12) ---
if (!rhRoom.hidden && (meta?.block === 'a' || meta?.block === 'b' || meta?.faculty === 'hukuk' || meta?.faculty === 'mimarlık')) {
  rhRoom.textContent = rhRoom.textContent.replace(
    /\b([a-zçğıöşü]+)(\d{2,3})\b/gi,
    (m, letters, digits) => letters.toUpperCase() + digits
  );
}

  // SON KİLİT: Hiç görünür chip yoksa bar kapalı
  roomHead.hidden = !hasVisibleChip();
}


function parseClassName(q){
  const raw = (q||'').trim();
  if (!raw) return { ok:false, reason:'Boş arama' };
// A-105 / A105 / A 105 koruma
if (/\bA[\s-]?\d{3}\b/i.test(raw)) {
  return { ok:false, reason:'A-105 formatı desteklenmiyor', input: raw };
}
  const s = normalizeStr(raw);
  const tokens = s.split(/[\s\-_]+/).filter(Boolean);
// B/C/D ile başlayan 3 haneli kod YOK → erken çık
if (/^\s*[bcd][\s-]?\d{3}\s*$/i.test(raw)) {
  return { ok:false, reason:'B/C/D ile başlayan sınıf kodu yok', input: raw };
}

  const isSingleLetter = (t)=> /^[a-z]$/.test(t);
  const isFloorRoom    = (t)=> /^[a-dz]\d{2}$/.test(t);             // a25, b08…
  const isThreeDigits  = (t)=> /^\d{3}$/.test(normalizeCompact(t)); // 110, 205…
	const isTwoDigits    = (t)=> /^\d{2}$/.test(t);   // ör: "15"

  const compact        = (t)=> normalizeCompact(t);                 // "L-A25" -> "la25"

  let block=null, blockLabel=null;
  let floor=null, floorLabel=null;
  let room=null, roomCode=null;
// --- A2) TEK BAŞINA harf+2 rakam → sadece Zxx (YDB)
for (let i=0;i<tokens.length;i++){
  const t = tokens[i];
  // sadece Z + 2 hane kabul
  if (/^z[\-\_\s]?\d{2}$/i.test(t)){
    const room2 = t.replace(/[^0-9]/g,'').slice(0,2);
    return {
      ok:true,
      method:'letter-floor-2digit-z-only',
      block: 'c',               // YDB’de A&C olduğu için C’ye düşürüyoruz (başlıkta “YDB Binası” zaten gösteriliyor)
      blockLabel: 'C',
      floor: FLOOR_MAP['z'],    // 0
      floorLabel: 'Z',
      room: room2,
      roomCode: null,
      input: raw
    };
  }
}

  for (let i=0;i<tokens.length;i++){
    const c = compact(tokens[i]);
    const m = c.match(/^([hklnprm])([a-dz])(\d{2})$/i); // SADECE H,K,L,M,N,P,R
    if (m){
      block = m[1].toLowerCase(); blockLabel = block.toUpperCase();
      const flCh = m[2].toLowerCase(); floor = FLOOR_MAP[flCh]; floorLabel = flCh.toUpperCase();
      room = m[3];
      roomCode = `${blockLabel}-${floorLabel}${room}`;
      return { ok:true, method:'compact-anywhere', block, blockLabel, floor, floorLabel, room, roomCode, input: raw };
    }
// yardımcı: izinli blok harfi mi?
function isAllowedRoomBlockLetter(ch){ return /^[hklnprm]$/i.test(ch || ''); }

if (
  isSingleLetter(tokens[i]) &&
  isAllowedRoomBlockLetter(tokens[i]) &&
  i+1 < tokens.length &&
  isFloorRoom(tokens[i+1])
){
  block = tokens[i].toLowerCase(); blockLabel = block.toUpperCase();
  const fr = tokens[i+1]; const flCh = fr[0].toLowerCase();
  floor = FLOOR_MAP[flCh]; floorLabel = flCh.toUpperCase();
  room  = fr.slice(1);
  roomCode = `${blockLabel}-${floorLabel}${room}`;
  return { ok:true, method:'split-compact-anywhere', block, blockLabel, floor, floorLabel, room, roomCode, input: raw };
}

if (isSingleLetter(tokens[i]) && i+1<tokens.length && isTwoDigits(tokens[i+1])){
  const flChRaw = tokens[i][0];
  const flCh = flChRaw.toLowerCase(); // a/b/c/d/z dışıysa bu kural geçersiz

  // Sadece a/b/c/d/z izinli
  if (!['a','b','c','d','z'].includes(flCh)) {
    // H-15 gibi durumlar buradan geçmesin
  } else {
    floor      = FLOOR_MAP[flCh];
    floorLabel = flCh.toUpperCase();
    room       = tokens[i+1];

    // Blok belirtilmediyse, SADECE z için C bloğa düş
    if (flCh === 'z') {
      block      = 'c';
      blockLabel = 'C';
    } else {
      // a/b/c/d için blok belirtilmediyse bile burada tahmin etmiyoruz
      // bu dalı tamamen iptal etmek daha güvenli
      return { ok:false, reason:'Eksik blok', input: raw };
    }

    roomCode   = `${floorLabel}${room}`;
    return {
      ok:true,
      method:'split-letter-two-digits',
      block, blockLabel, floor, floorLabel, room, roomCode,
      input: raw
    };
  }
}


  }

// --- B) Harf + 3 hane (k205, m102, l205) ---
for (let i=0;i<tokens.length;i++){
  const m = compact(tokens[i]).match(/^([hklnprm])(\d)(\d{2})$/i);
  if (m){
    block = m[1].toLowerCase(); blockLabel = block.toUpperCase();
    floor = parseInt(m[2],10);  floorLabel = String(floor).toUpperCase();
    room  = m[3];
    roomCode = `${floor}${room}`;

    // A/B/C dışındaki bloklar için "L-205" gibi gösterim üret
    const displayRoomText = !['A','B','C'].includes(blockLabel)
      ? `${blockLabel}-${floor}${room}`
      : `${floor}${room}`;

    return {
      ok:true,
      method:'letter-3digits',
      block, blockLabel, floor, floorLabel, room, roomCode,
      displayRoomText,
      input: raw
    };
  }
}

  // --- C) “K blok 2. kat” gibi: blok + kat (oda yok) ---
  for (let i=0;i<tokens.length;i++){
    if (tokens[i]==='blok' && i>0 && isSingleLetter(tokens[i-1])){
      block = tokens[i-1].toLowerCase(); blockLabel = block.toUpperCase();
    }
    const katM = tokens[i].match(/^(\d+)\.?$/);
    if ((tokens[i]==='kat' || tokens[i]==='katı') && i>0 && /^\d+\.?$/.test(tokens[i-1])){
      floor = parseInt(tokens[i-1],10); floorLabel = String(floor);
    } else if (katM && i+1<tokens.length && (tokens[i+1]==='kat' || tokens[i+1]==='katı')){
      floor = parseInt(katM[1],10); floorLabel = String(floor);
    }
  }
  if (block && (floor!==null)){
    return { ok:true, method:'block-floor', block, blockLabel, floor, floorLabel, room:null, roomCode:null, input: raw };
  }

// --- D) Sadece 3 hane (110 vb): yalnız ÖNÜNDE geçerli blok (H/K/L/M/N/P/R) varsa kabul ---
for (let i=0;i<tokens.length;i++){
  if (isThreeDigits(tokens[i])){
    const n = compact(tokens[i]);       // "110"
    const f = parseInt(n[0],10);
    const rm = n.slice(1);

    // yalnızca geçerli blok harfi ÖNCESİNDE varsa aksepte et
    if (i>0 && /^[hklnprm]$/i.test(tokens[i-1])) {
      block      = tokens[i-1].toLowerCase();
      blockLabel = block.toUpperCase();
      floor      = f;
      floorLabel = String(f).toUpperCase();
      room       = rm;
      roomCode   = `${floor}${room}`;

      // A/B/C dışındaki bloklar için "L-205" gibi gösterim üret
      const displayRoomText = !['A','B','C'].includes(blockLabel)
        ? `${blockLabel}-${floor}${room}`
        : `${floor}${room}`;

      return {
        ok:true,
        method:'three-digits-with-valid-block',
        block, blockLabel, floor, floorLabel, room, roomCode,
        displayRoomText,
        input: raw
      };
    }
  }
}

  // --- E) sadece blok harfi verilmiş olabilir ---
  for (let i=0;i<tokens.length;i++){
    if (isSingleLetter(tokens[i])){
      block = tokens[i].toLowerCase(); blockLabel = block.toUpperCase();
      return { ok:true, method:'block-only', block, blockLabel, floor:null, floorLabel:null, room:null, roomCode:null, input: raw };
    }
  }

  return { ok:false, reason:'Deseni çözemedim', input: raw };
}



function detectFacultyFromInput(q){
  const s = normalizeStr(q);
  const tokens = s.split(/[\s\-\_]+/).filter(Boolean);
  for (const fac of FACULTY_PRIORITY){ if (tokens.some(t => t === fac)) return fac; }
  for (const fac of FACULTY_PRIORITY){
    const aliases = FACULTY_ALIASES[fac] || [];
    if (tokens.some(t => aliases.some(a => t.startsWith(a)))) return fac;
  }
  return null;
}
function detectSpecialToBlock(q){
  const s = normalizeStr(q);
  const hasAmfi     = /\b(?:\d+\s*\.?\s*)?amf[ıi]\b/.test(s) || /\bamf[ıi]\s*[-\s]*[1-6]\b/.test(s);
  const hasFotokopi = /\bfotokopi(?:ci)?\b/.test(s);
  const hasKirtasiye= /\bkırtasiye(?:ci)?\b/.test(s);
  const hasStore    = /\b(?:çankaya\s*)?store\b/.test(s);
  if (hasAmfi || hasFotokopi || hasKirtasiye || hasStore) return 'h';
  return null;
}
function findFacultyPinWord(word){
  if(!word) return null;
  const w = normalizeForMatch(word);
  let cand = PINS.find(p => fieldHasPrefix(p.title, w)); if (cand) return cand;
  cand = PINS.find(p => fieldHasPrefix(p.type, w));      if (cand) return cand;
  cand = PINS.find(p => new RegExp(`\\b${w}\\b`).test(normalizeForMatch(p.title||''))); if (cand) return cand;
  cand = PINS.find(p =>
    new RegExp(`\\b${w}\\b`).test(normalizeForMatch(p.type||'')) ||
    new RegExp(`\\b${w}\\b`).test(normalizeForMatch(p.desc||'')));
  return cand || null;
}
function findBlockPinByCode(code){
  if(!code) return null;
  const norm = normalizeForMatch(code);

  // Sadece tek harf ve H/K/L/M/N/P/R ise çalışsın
  if (!/^[hklnprm]$/.test(norm)) return null;

  const want = `${norm} blok`;

  let cand = PINS.find(p => normalizeForMatch(p.title) === want); if(cand) return cand;
  cand = PINS.find(p => normalizeForMatch(p.title).startsWith(want)); if(cand) return cand;
  cand = PINS.find(p => normalizeForMatch(p.type) === want || normalizeForMatch(p.type).startsWith(want)); if(cand) return cand;
  cand = PINS.find(p => normalizeForMatch(p.title) === norm); if(cand) return cand;
  const hint = BLOCK_FACULTY_HINT[norm];
  if (hint){ const fpin = findFacultyPinWord(hint); if (fpin) return fpin; }
  cand = PINS.find(p => {
    const t = normalizeForMatch(p.title);
    return new RegExp(`^${norm}\\b`).test(t) && !/^mescit\b/.test(t);
  });
  return cand || null;
}
function isDormQuery(q){
  const s = (q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // tüm unicode harf/rakam kalsın
    .replace(/\s+/g, ' ')
    .trim();

  // Türkçe aksanları ASCII'ye yaklaştır (ö->o, ğ->g, ı->i, ş->s, ç->c, ü->u)
  const ascii = s
    .replace(/ö/g, 'o').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ü/g, 'u');

  // “yurt” tek başına ya da “öğrenci yurdu / ogrenci yurdu”
  return (
    s.includes('yurt') ||
    s.includes('öğrenci yurdu') ||
    ascii.includes('ogrenci yurdu')
  );
}

function findDormPins(){
  const bagOf = (p) => (
    ((p.title||'') + ' ' + (p.type||'') + ' ' + (p.subTitle||p.subtitle||'') + ' ' + (p.desc||''))
      .toLowerCase()
  );

  const hasDormWords = (text) => {
    const s = text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const ascii = s
      .replace(/ö/g, 'o').replace(/ğ/g, 'g').replace(/ı/g, 'i')
      .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ü/g, 'u');
    return s.includes('yurt') || s.includes('öğrenci yurdu') || ascii.includes('ogrenci yurdu');
  };

  let male = null, female = null;

  for (const p of PINS){
    if (!p.coord) continue;
    const bag = bagOf(p);
    if (!hasDormWords(bag)) continue;

    if (!male   && /erkek/i.test(bag))       male   = p;
    if (!female && /(kız|kiz)/i.test(bag))   female = p;
    if (male && female) break;
  }

  return { male, female };
}
function zoomBetweenPins(p1, p2, pad=1){
  const minX = Math.min(p1.coord[0], p2.coord[0]);
  const maxX = Math.max(p1.coord[0], p2.coord[0]);
  const minY = Math.min(p1.coord[1], p2.coord[1]);
  const maxY = Math.max(p1.coord[1], p2.coord[1]);
  zoomToBounds(minX, minY, maxX, maxY, pad, 2000);
}


// -------- Daha iyi serbest metin araması --------
function escapeRegExp(s){ return (s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function simplify(s){
  return normalizeStr(s).replace(/-/g,' ').replace(/\s+/g,' ').trim(); // "1-2" ≈ "1 2"
}
function fieldBag(p){
  return simplify([p.title,p.type,p.subTitle,p.subtitle,p.desc].filter(Boolean).join(' '));
}

// Sorgudaki tüm önemli kelimeler (>=2 harf) ve tüm rakam segmentleri alanlarda geçmeli
function tokensOf(query){
  const q = simplify(query);
  return q.split(' ').filter(t => t.length>=2 || /\d/.test(t));
}

function findBestPin(query){
  const want      = simplify(query);
  if(!want) return null;

  // 1) Tek harf = blok kısayolu (sadece bu durumda blok ara)
// Yalnızca H/K/L/M/N/P/R tek harf yazılırsa blok kısayolu
if (/^[HKLMNPR]$/i.test(want)){
  const byBlock = findBlockPinByCode(want.toLowerCase());
  if (byBlock) return byBlock;
}

  // 2) Önce başlıkta TAM eşitlik
  let cand = PINS.find(p => simplify(p.title||'') === want);
  if (cand) return cand;

  // 3) Herhangi bir alanda TAM eşitlik
  cand = PINS.find(p => fieldBag(p) === want);
  if (cand) return cand;

  // 4) Kelime bazlı kapsama: tüm token'lar alanda kelime sınırlarıyla geçmeli
  const toks = tokensOf(want);
  if (toks.length){
    cand = PINS.find(p => {
      const bag = ' ' + fieldBag(p) + ' ';
      return toks.every(t => new RegExp(`\\b${escapeRegExp(t)}\\b`).test(bag));
    });
    if (cand) return cand;
  }

  // 5) Son çare: başlığa "tüm token'lar geçmeli" (prefix değil!) kuralı
  cand = PINS.find(p => {
    const t = ' ' + simplify(p.title||'') + ' ';
    return toks.every(w => new RegExp(`\\b${escapeRegExp(w)}\\b`).test(t));
  });
  if (cand) return cand;

  // 6) Prefix'e düşme ama yalnızca sorgu 3+ karakterse ve en az iki token içeriyorsa
  if (want.length>=3){
    cand = PINS.find(p => fieldHasPrefix(p.title, want)) ||
           PINS.find(p => fieldHasPrefix(p.type,  want)) ||
           PINS.find(p => fieldHasPrefix(p.desc,  want));
    if (cand) return cand;
  }
  return null;
}


// === YDB özel arama ===
// A & C birleşik pinini yakala (başlıkta "A Blok" ve "C Blok" birlikte geçsin
// veya herhangi bir alanda "Hazırlık" / "YDB" geçsin)
function findACCombinedPin(){
  const hasAC = (s) => /\ba\s*blok\b.*\bc\s*blok\b|\bc\s*blok\b.*\ba\s*blok\b/i.test(s);
  const hasYDB = (s) => /\bhaz[ıi]rl[ıi]k\b|\bydb\b/i.test(s);

  return PINS.find(p => {
    const bag = [
      p.title, p.type, p.subTitle, p.subtitle, p.desc
    ].map(x => normalizeForMatch(x||'')).join(' ');
    // normalizeForMatch zaten TR küçük-büyük normalize ediyor
    return hasAC(bag) || hasYDB(bag);
  }) || null;
}
function isYDBQuery(q){
  const s = (q||'').trim();
  const three  = /^\d{3}$/;          // 105, 203
  const zform2 = /^z[\s-]?\d{2}$/i;  // Z10, Z-06
  return three.test(s) || zform2.test(s);  // Z + 3 hane artık kabul edilmez
}

function buildYDBMeta(q){
  const raw = (q||'').trim();

  // Kat bilgisi: 3 hane → ilk hane (sayı), Zxx → 'Z'
  let floor = null;         // sayı olacaksa buraya
  let floorLabel = null;    // 'Z' gibi harfse buraya

  if (/^\d{3}$/.test(raw)){
    floor = parseInt(raw[0], 10);   // 102 → 1
} else if (/^z[\s-]?\d{2}$/i.test(raw)){
  floorLabel = 'Z';
}

let displayRoomText = raw.toUpperCase();
if (/^Z\d{2}$/.test(displayRoomText)) displayRoomText = `Z-${displayRoomText.slice(1)}`;

  return {
    ok:true,
    method:'ydb-override',
    block:null,
    blockLabel:'YDB Binası',
    floor,                  // sayı ise burada (1,2,3…)
    floorLabel,             // harf ise burada ('Z')
    room:null,
    roomCode:null,
    displayRoomText,
    input: raw
  };
}

/* Animasyonlar */
function animateVBTo(tx, ty, tw, th, duration=2000){
  const sx=vX, sy=vY, sw=vW, sh=vH;
  const start=performance.now();
  function clampBox(x,y,w,h){
    let nx=x, ny=y;
    if(nx < vbX0) nx = vbX0;
    if(ny < vbY0) ny = vbY0;
    if(nx + w > vbX0 + vbW0) nx = vbX0 + vbW0 - w;
    if(ny + h > vbY0 + vbH0) ny = vbY0 + vbH0 - h;
    return [nx,ny,w,h];
  }
  function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
  function step(now){
    const t = Math.min(1, (now-start)/duration);
    const e = easeInOutCubic(t);
    const nx = sx + (tx - sx)*e;
    const ny = sy + (ty - sy)*e;
    const nw = sw + (tw - sw)*e;
    const nh = sh + (th - sh)*e;
    const [cx,cy,cw,ch] = clampBox(nx,ny,nw,nh);
    setVB(cx,cy,cw,ch);
    if(t<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function animateVBToAsync(tx, ty, tw, th, duration=2000){
  /* FIX: bu sürümde syntax hatası yok */
  return new Promise(resolve=>{
    const sx=vX, sy=vY, sw=vW, sh=vH;
    const start=performance.now();
    function clampBox(x,y,w,h){
      let nx=x, ny=y;
      if (nx < vbX0) nx = vbX0;
      if (ny < vbY0) ny = vbY0;
      if (nx + w > vbX0 + vbW0) nx = vbX0 + vbW0 - w;
      if (ny + h > vbY0 + vbH0) ny = vbY0 + vbH0 - h;
      return [nx,ny,w,h];
    }
    function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
    function step(now){
      const t = Math.min(1, (now-start)/duration);
      const e = easeInOutCubic(t);
      const nx = sx + (tx - sx)*e;
      const ny = sy + (ty - sy)*e;
      const nw = sw + (tw - sw)*e;
      const nh = sh + (th - sh)*e;
      const [cx,cy,cw,ch] = clampBox(nx,ny,nw,nh);
      setVB(cx,cy,cw,ch);
      if (t<1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
}
	function zoomToLevelAt(mx, my, level = 18, duration = 2000){
  const targetW = levelToTargetW(level);
  const targetH = targetW * (vH / vW);

  let nx = mx - targetW/2;
  let ny = my - targetH/2;

  // kenarlara taşmayı engelle
  if (nx < vbX0) nx = vbX0;
  if (ny < vbY0) ny = vbY0;
  if (nx + targetW > vbX0 + vbW0) nx = vbX0 + vbW0 - targetW;
  if (ny + targetH > vbY0 + vbH0) ny = vbY0 + vbH0 - targetH;

  animateVBTo(nx, ny, targetW, targetH, duration);

  // sonraki scroll/zoom davranışları tutarlı kalsın
  AUTOLOCK_MIN_W = targetW;
  hasAutoZoomed  = true;
}

function recenterToPin(p){
  if(!p || !p.coord) return;
  const mx=p.coord[0], my=p.coord[1];
  const targetW = vW;
  const targetH = targetW*(vH/vW);
  let nx = mx - targetW/2;
  let ny = my - targetH/2;
  if(nx < vbX0) nx = vbX0;
  if(ny < vbY0) ny = vbY0;
  if(nx + targetW > vbX0 + vbW0) nx = vbX0 + vbW0 - targetW;
  if(ny + targetH > vbY0 + vbH0) ny = vbY0 + vbH0 - targetH;
  animateVBTo(nx, ny, targetW, targetH, 2000);
  lastTargetPinId = p.id || null;
}
async function travelToPin(p){
  if(!p || !p.coord) return;
  const mx = p.coord[0], my = p.coord[1];

  const isH = isHBlockPin(p);

  const defaultLock = (window.innerWidth < 768) ? (vbW0 / 8) : (vbW0 / 6);

  const hLockMobile = vbW0/4;
  const hLockDesk   = vbW0/3.2;

  const baseLock = isH ? ((window.innerWidth < 768) ? hLockMobile : hLockDesk)
                       : (AUTOLOCK_MIN_W ?? defaultLock);

  const targetW = isH ? baseLock : Math.min(vW, baseLock);
  const targetH = targetW * (vH / vW);

  let nx = mx - targetW / 2;
  let ny = my - targetH / 2;
  if (nx < vbX0) nx = vbX0;
  if (ny < vbY0) ny = vbY0;
  if (nx + targetW > vbX0 + vbW0) nx = vbX0 + vbW0 - targetW;
  if (ny + targetH > vbY0 + vbH0) ny = vbY0 + vbH0 - targetH;

  await animateVBToAsync(nx, ny, targetW, targetH, 2000);

  if (isH){ AUTOLOCK_MIN_W = null; } else { AUTOLOCK_MIN_W = targetW; }
  hasAutoZoomed  = true;
  lastTargetPinId = p.id || null;
}
function zoomToPin(p){
  if(!p || !p.coord) return;
  const mx = p.coord[0], my = p.coord[1];

const t   = TYPES[p.type] || {};
const lvl = t.actionZoom ?? t.nameZoom ?? t.zoomLevel ?? 6;

const targetW = levelToTargetW(lvl);
  const targetH = targetW * (vH / vW);

  let nx = mx - targetW/2;
  let ny = my - targetH/2;
  if(nx < vbX0) nx = vbX0;
  if(ny < vbY0) ny = vbY0;
  if(nx + targetW > vbX0 + vbW0) nx = vbX0 + vbW0 - targetW;
  if(ny + targetH > vbY0 + vbH0) ny = vbY0 + vbH0 - targetH;

  animateVBTo(nx, ny, targetW, targetH, 1000);

  AUTOLOCK_MIN_W = targetW;      // sonraki yakınlaştırmalarda alt sınır
  hasAutoZoomed  = true;
  lastTargetPinId = p.id || null;
}


function renderParseResult(res){
  if (!outEl) return;
  outEl.textContent = '';
}


if (formEl && inputEl){
  formEl.addEventListener('submit', async (e)=>{
    e.preventDefault();
    inputEl.blur();

    const q = inputEl.value || '';
// A-105 / A105 / A 105 yasak
if (/\bA[\s-]?\d{3}\b/i.test(q)) {
  outEl.textContent = '❗ Bu format desteklenmiyor (örn: A-105, A105). Lütfen A12 / B08 gibi yazın.';
  return;
}
	  // 4+ haneli düz sayı (örn: 1963) → geçersiz
if (/^\s*\d{4,}\s*$/.test(q)) { outEl.textContent = '❗ Geçersiz: 4 haneli (veya daha uzun) kod yok'; return; }

// H/K/L/M/N/P/R + 4+ hane (örn: k1000) → geçersiz
if (/^\s*[hklnprm][\s-]?\d{4,}\s*$/i.test(q)) { outEl.textContent = '❗ Geçersiz: 4 haneli sınıf kodu yok'; return; }

// Blok+Kat+3 hane (örn: kb250) → geçersiz
if (/^\s*[hklnprm][a-dz][\s-]?\d{3}\s*$/i.test(q)) { outEl.textContent = '❗ Geçersiz: Kat+oda 3 haneli olamaz (örn: KB250)'; return; }

// YDB: Z + 3 hane (örn: z150) → geçersiz (sadece Z + 2 hane)
if (/^\s*z[\s-]?\d{3}\s*$/i.test(q)) { outEl.textContent = '❗ Geçersiz: YDB için sadece Z + 2 hane geçerli'; return; }

// Tek başına A/B/C/D + 2 hane (örn: a05, b03) → geçersiz
if (/^\s*[a-d][\s-]?\d{2}\s*$/i.test(q)) { outEl.textContent = '❗ Geçersiz: A05/B03 gibi tek başına kat+oda yok'; return; }
	  // === AMFİ & ÖZEL ODA KISAYOLLARI ===
// 2.0) "amfi 1" varyasyonları -> Mavi Amfi pinini aç
{
  const s = (q || '').toLowerCase().trim();

  // "amfi 1", "amfi-1", "amfi1" hepsi yakalansın
  const isAmfi1 =
    /\bamfi\s*-?\s*1\b/.test(s) ||   // amfi 1 / amfi-1
    s === 'amfi1' || s === 'amfi-1'; // çıplak eşitlikler

  if (isAmfi1){
    const mavi = getMaviAmfiPin();
    if (mavi){
      lastSearchMeta = null;          // meta zorunlu değil; direkt pin
      openInfo(mavi.id);              // PINİ aç
      zoomToPin(mavi);                // yakınlaş
      outEl.textContent = '✓ Mavi Amfi açıldı';
      return;
    }
    // pin bulunamazsa sessizce normal akışa bırak
  }
}

// 2.1) "amfi 2..6" -> H Blok ORTAK ALAN PINI AÇ + rozetler (H / 1. Kat / Amfi N)
{
  const m = (q||'').toLowerCase().match(/\bamfi\s*-?\s*(\d)\b/);
  if (m){
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 6){
      const meta = {
        ok: true,
        block: 'h',
        blockLabel: 'H',
        floor: 1,                      // 1. Kat
        floorLabel: null,
        displayRoomText: `Amfi ${n}`   // çipte “Amfi N”
      };

      const hPin = getHBlockPin();
      if (hPin){
        // PINİ AÇ
        openInfo(hPin.id);

        // openInfo başta chip'leri sıfırladığı için yeniden yazdır
        lastSearchMeta = meta;
        updateRoomHead(meta);

        // H pinine yakınlaş
        zoomToPin(hPin);

        outEl.textContent = `✓ Amfi ${n} — H Blok / 1. Kat (Ortak Alan pini)`;
        return;
      }

      // H pini hiç yoksa: sheet fallback (yine H Blok)
      lastSearchMeta = meta;
      openSharedArea(meta, { title: 'Ortak Alan', sub: 'H Blok' });
      const hFallback = getHBlockPin();
      if (hFallback) zoomToPin(hFallback);
      return;
    }
  }
}



// 2.2) H-102 → Kırmızı Amfi pini
{
  const sUp = (q||'').trim().toUpperCase().replace(/\s+/g,'');
  if (sUp === 'H-102' || sUp === 'H102'){
    const pinKirmizi = findPinByTitleExactToken('kırmızı amfi') || findPinByTitleSmart('Kırmızı Amfi');
    if (pinKirmizi){
      lastSearchMeta = null;
      openInfo(pinKirmizi.id);
      zoomToPin(pinKirmizi);
      outEl.textContent = '✓ Kırmızı Amfi açıldı';
      return;
    }
    // Pin yoksa ortak alan
    const meta = { ok:true, block:'h', blockLabel:'H', floor:1, floorLabel:null, displayRoomText:'H-102' };
    openSharedArea(meta, { title:'Ortak Alan', sub:'H Blok', desc:'' });
    const hPin = findBlockPinByCode('h') || findBestPin('H Blok');
    if (hPin) recenterToPin(hPin);
    return;
  }
}

// 2.3) HLKMNPR: H-xxx → H Blok PINİ; diğerleri kendi blok pini
{
  if (isHLKMNPRQuery(q)){
    const meta = buildHLKMNPRMeta(q);
    if (meta && meta.ok && isFloorAllowedForHLKMNPR(meta)){

      // hedef blok: H ise H; değilse kendi harfi
      const targetBlock = (meta.block === 'h') ? 'h' : meta.block;

      // Önce özel H yakalayıcı; sonra genel blok yakalayıcılar
      let blkPin = null;
      if (targetBlock === 'h'){
        blkPin = getHBlockPin();
      } else {
        blkPin =
          (findBlockPinByCode(targetBlock) || null) ||
          findBestPin(`${(targetBlock||'').toUpperCase()} Blok`);
      }

      // Rozetleri hazırla
      lastSearchMeta = meta;

      if (blkPin){
        // PIN AÇ + ÇİPLERİ GÖSTER + ZOOM
        openInfo(blkPin.id);
        updateRoomHead(meta);  // openInfo’nun temizliğini geri yaz
        zoomToPin(blkPin);

        outEl.textContent = `✓ ${ (meta.displayRoomText || '').toString() } — ${(meta.block||'').toUpperCase()} Blok (Ortak Alan)`;
        return;
      }

      // Pin bulunmazsa yine “Ortak Alan” sheet + mümkünse H’ye yakınlaş
      openSharedArea(meta, { title:'Ortak Alan', sub: `${(meta.block||'').toUpperCase()} Blok` });
      if (meta.block === 'h'){
        const hPin = getHBlockPin();
        if (hPin) zoomToPin(hPin);
      }
      return;
    }
  }
}

// (1) İki harf + (opsiyonel -/boşluk) + TEK rakam  → geçersiz  (örn: kb0, ab-1, xy 7)
if (/^\s*[a-zçğıöşü]{2}[\s-]?\d\s*$/i.test(q)) {
  outEl.textContent = '❗ Geçersiz: “iki harf + tek rakam” formatı desteklenmiyor (örn: kb0)';
  return;
}

// (2) Sadece iki harf ardarda → geçersiz (örn: kb, ab, xy)
if (/^\s*[a-zçğıöşü]{2}\s*$/i.test(q)) {
  outEl.textContent = '❗ Geçersiz: “iki harf” ile başlayan belirsiz kısaltmalar desteklenmiyor (örn: kb)';
  return;
}
// === YURT KISAYOLU ===
if (isDormQuery(q)) {
  const { male, female } = findDormPins();

  // iki yurt da varsa: tam ORTA + seviye 18
  if (male && female){
    lastSearchMeta = null;
    if (sheetState !== 'closed') closeSheet();
    restoreAllPins();

    const mx = (male.coord[0] + female.coord[0]) / 2;
    const my = (male.coord[1] + female.coord[1]) / 2;

    zoomToLevelAt(mx, my, 18, 2000);
    return;
  }

  // tek yurt bulunursa: ona 18’lik yakınlaş
  const only = male || female;
  if (only){
    lastSearchMeta = null;
    if (sheetState !== 'closed') closeSheet();
    restoreAllPins();

    zoomToLevelAt(only.coord[0], only.coord[1], 18, 2000);
    return;
  }

  // hiçbiri yoksa normal akışa bırak
}

	  // "hazırlık" / "ydb" yazılırsa birleşik A&C pinini direkt aç
{
  const acWordHit = /\bhaz[ıi]rl[ıi]k\b|\bydb\b/i.test(q);
  if (acWordHit) {
    const ac = findACCombinedPin();
    if (ac) {
      lastSearchMeta = { ok:true, method:'ydb-word', blockLabel:'YDB Binası' };
      openInfo(ac.id);
      zoomToPin(ac);
      outEl.textContent = '✓ YDB / Hazırlık açıldı';
      return;
    }
  }
}
    // HLKMNPR + iki rakam → geçersiz (örn: H-15)
    {
      const s = (q||'').trim().toUpperCase();
      if (/^[HLKMNPR][\s-]?\d{2}$/.test(s)) {
        outEl.textContent = '❗ Bulunamadı: Bu blokta iki haneli sınıf formatı yok (örn: H-15 geçersiz)';
        return;
      }
    }
	  // 0) Fakülte tabanlı akış (Hukuk/Mimarlık)
{
  const fres = parseFacultyQuery(q);
  if (fres && fres.ok) {
    lastSearchMeta = fres;
    let pin = findFacultyPinWord(fres.faculty) || findBlockPinByCode(fres.block);
    if (!pin) { outEl.textContent = '❗ Bulunamadı'; return; }

    openInfo(pin.id);
    zoomToPin(pin);

    if (fres.method === 'faculty-building') {
      outEl.textContent = `✓ ${fres.blockLabel} açıldı`;
    } else {
      renderParseResult(fres);
    }
    return;
  }
}
    // === BURADAN İTİBAREN EKLEYİN ===
    let res=null; let pin=null;

// (mescit özel zoomu kaldırıldı)
if (isYDBQuery(q)){
  res = buildYDBMeta(q);
  if (res.ok && !isYDBFloorAllowed(res)){
    return;
  }
} else {
  // standart arama akışı
  pin = findPinByTitleExactToken(q) || findPinByTitleSmart(q);

  if (!pin) {
    const specBlk = detectSpecialToBlock(q);
    if (specBlk){ pin = findBlockPinByCode(specBlk); }
    if (!pin){
      const fac = detectFacultyFromInput(q);
      if (fac){ pin = findFacultyPinWord(fac); }
    }
  }

  if (!pin){
    res = parseClassName(q);
    if (!res.ok){
      pin = findMatchingPin(q) || findACCombinedPin();
      if (!pin){ outEl.textContent = '❗ Bulunamadı'; return; }
      openInfo(pin.id); zoomToPin(pin); return;
    }
  }
}


    renderParseResult(res);

    // 2) Hedef pini seç
    if (!pin){
      if (res.method === 'ydb-override'){
        pin = findACCombinedPin();
      }
      if (!pin && res.block){
        pin = findBlockPinByCode(res.block);
      }
    }
    if (!pin){
      pin = findBestPin(q) || findACCombinedPin();
    }
    if (!pin){
      outEl.textContent = '❗ Bulunamadı';
      return;
    }

// 3) Aç ve yakınlaştır (ikinci aramada zoom’u tekrarlama)
lastSearchMeta = res && res.ok ? res : null;
openInfo(pin.id);

const skipZoom = hasAutoZoomed && !userMovedView;
if (skipZoom){
  // yalnızca merkeze al; mevcut zoom’u koru
  recenterToPin(pin);
  return;
}

// yeni auto-zoom yapıyoruz → tekrar kilit kur
userMovedView = false;
zoomToPin(pin);

  }); // <— submit listener biter
} // <— if (formEl && inputEl) biter
// === EKLEDİĞİNİZ KISIM BURADA BİTER ===

/* misc */
function isHBlockPin(p){
  const t = (p.title||'').toLowerCase();
  const s = (p.subTitle||p.subtitle||p.sub||'').toLowerCase();
  const ty= (p.type||'').toLowerCase();
  return t.includes('h blok') || s.includes('h blok') || ty.includes('h blok');
}
	function getHBlockPin(){
  return (
    findBlockPinByCode('h') ||                    // "H Blok" başlıklı pin
    (PINS.find(p => isHBlockPin(p)) || null) ||   // başlık/alt başlık/type içinde "H Blok"
    findBestPin('H Blok') ||                      // son çare: serbest metin
    null
  );
}
function getMaviAmfiPin(){
  return (
    findPinByTitleExactToken('mavi amfi') ||
    findPinByTitleSmart('Mavi Amfi') ||
    null
  );
}
	function isYemekhanePin(p){
  // title + alt başlık + type + açıklamada Yemekhane/Kantin/Kafeterya anahtar kelimeleri
  const bag = (
    (p.title||'') + ' ' +
    (p.subTitle||p.subtitle||p.sub||'') + ' ' +
    (p.type||'') + ' ' +
    (p.desc||'')
  ).toLowerCase();

  // İstersen buraya başka varyasyonlar da ekleyebilirsin (örn. "yemek" tek başına çok geniş olabilir diye eklemedim)
  return /\byemekhane\b|\bkantin\b|\bkafeterya\b/.test(bag);
}

