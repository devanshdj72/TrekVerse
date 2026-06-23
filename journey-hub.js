/* ════════════════════════════════════════════════════════════════
   JOURNEY HUB — companion features for SummitLog
   Timeline · Bucket List · Achievements/XP · Constellation · Oracle ·
   Search extension · Stats · Export/Import

   Design rule: zero new visual language. Every element below reuses
   the host app's existing CSS classes (.btn/.bp/.bsec/.bd, .mf,
   .ss, .diff-opt, #sheet/#sheetbackdrop pattern, #modal pattern,
   toast()) and CSS variables (--bg --surf --glass --bord --txt
   --mute --ora --grn --blu --pur --red --yel). No new fonts, no
   new colors, no new easing curves beyond what the host already uses.
   ════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

// ── Wait for host app's globals to exist (toast, openSheet, TREKS, etc.) ──
function whenHostReady(cb, attempts){
  attempts = attempts || 0;
  const ready = typeof window.toast === 'function' && typeof TREKS !== 'undefined';
  if (ready) { cb(); return; }
  if (attempts > 100) { // ~5s of polling at 50ms — something is genuinely wrong
    console.error('[JourneyHub] Host app globals (toast/TREKS) never became available. Journey Hub will not load.');
    return;
  }
  setTimeout(()=>whenHostReady(cb, attempts+1), 50);
}

// ════════════════════════════════════════════════════════════════
// STORAGE — namespaced exactly like host's sl3_* keys
// ════════════════════════════════════════════════════════════════
const LS = {
  pins:    'sl3_journey_pins',     // memory/journal entries (separate from trek "logged" data)
  bucket:  'sl3_journey_bucket',
  xp:      'sl3_journey_xp',
  ach:     'sl3_journey_achievements', // unlocked achievement ids
};

function load(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch(e){ return fallback; }
}
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

let journeyPins   = load(LS.pins, []);
let bucketList    = load(LS.bucket, []);
let xpState       = load(LS.xp, { xp: 0 });
let unlockedAch   = load(LS.ach, []);

function persistPins(){ save(LS.pins, journeyPins); }
function persistBucket(){ save(LS.bucket, bucketList); }
function persistXP(){ save(LS.xp, xpState); }
function persistAch(){ save(LS.ach, unlockedAch); }

function uid(prefix){ return prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,7); }

// ════════════════════════════════════════════════════════════════
// CATEGORIES — 8 fixed categories, pill/chip everywhere
// ════════════════════════════════════════════════════════════════
const CATS = [
  { id:'visited',  label:'Visited',  emoji:'✅', color:'#2ea043' },
  { id:'dream',    label:'Dream',    emoji:'💜', color:'#a371f7' },
  { id:'lived',    label:'Lived',    emoji:'🏠', color:'#388bfd' },
  { id:'spiritual',label:'Spiritual',emoji:'🙏', color:'#d29922' },
  { id:'adventure',label:'Adventure',emoji:'⚔️', color:'#f97316' },
  { id:'beach',    label:'Beach',    emoji:'🏖️', color:'#388bfd' },
  { id:'heritage', label:'Heritage', emoji:'🏛️', color:'#7d8590' },
  { id:'family',   label:'Family',   emoji:'👨‍👩‍👧', color:'#f85149' },
];
const catById = id => CATS.find(c=>c.id===id) || CATS[0];

const MOODS = [
  {e:'😊',l:'Happy'}, {e:'🤩',l:'Euphoric'}, {e:'😌',l:'Peaceful'}, {e:'🥹',l:'Emotional'},
  {e:'😤',l:'Challenging'}, {e:'🤔',l:'Curious'}, {e:'😍',l:'Amazed'}, {e:'😎',l:'Adventurous'},
];

const PRIORITIES = [
  { id:'must',    label:'Must Visit', color:'#f85149' },
  { id:'dream',   label:'Dream',      color:'#a371f7' },
  { id:'someday', label:'Someday',    color:'#7d8590' },
];

// ════════════════════════════════════════════════════════════════
// XP / LEVEL
// ════════════════════════════════════════════════════════════════
function addXP(amount, reason){
  xpState.xp = Math.max(0, (xpState.xp||0) + amount);
  persistXP();
  renderXPBar();
  if(amount>0) toast(`+${amount} XP${reason?' — '+reason:''}`, '#a371f7');
  checkAchievements();
}
function getLevel(){ return Math.floor((xpState.xp||0)/200)+1; }
function xpIntoLevel(){ return (xpState.xp||0) % 200; }

// ════════════════════════════════════════════════════════════════
// ACHIEVEMENTS — 18 unlockable, check() against live data
// ════════════════════════════════════════════════════════════════
function distinctLocations(){
  return new Set(journeyPins.map(p=>(p.location||'').trim().toLowerCase()).filter(Boolean));
}
function distinctCatsUsed(){
  return new Set(journeyPins.map(p=>p.category));
}
const ACHIEVEMENTS = [
  { id:'first_entry', name:'First Steps', desc:'Create your first memory pin', emoji:'🌱', xp:50,
    check: ()=> journeyPins.length>=1 },
  { id:'entries_5', name:'Getting Started', desc:'Create 5 memory pins', emoji:'📍', xp:50,
    check: ()=> journeyPins.length>=5 },
  { id:'entries_10', name:'Storyteller', desc:'Create 10 memory pins', emoji:'📖', xp:75,
    check: ()=> journeyPins.length>=10 },
  { id:'entries_25', name:'Chronicler', desc:'Create 25 memory pins', emoji:'📚', xp:100,
    check: ()=> journeyPins.length>=25 },
  { id:'entries_50', name:'Living Archive', desc:'Create 50 memory pins', emoji:'🗃️', xp:150,
    check: ()=> journeyPins.length>=50 },
  { id:'countries_3', name:'Wanderer', desc:'Visit 3 distinct locations', emoji:'🧭', xp:60,
    check: ()=> distinctLocations().size>=3 },
  { id:'countries_10', name:'Globetrotter', desc:'Visit 10 distinct locations', emoji:'🌍', xp:120,
    check: ()=> distinctLocations().size>=10 },
  { id:'cat_visited', name:'Checked In', desc:'Log a Visited memory', emoji:'✅', xp:30,
    check: ()=> journeyPins.some(p=>p.category==='visited') },
  { id:'cat_dream', name:'Daydreamer', desc:'Log a Dream memory', emoji:'💜', xp:30,
    check: ()=> journeyPins.some(p=>p.category==='dream') },
  { id:'cat_lived', name:'Settled In', desc:'Log a Lived memory', emoji:'🏠', xp:30,
    check: ()=> journeyPins.some(p=>p.category==='lived') },
  { id:'cat_spiritual', name:'Soul Search', desc:'Log a Spiritual memory', emoji:'🙏', xp:30,
    check: ()=> journeyPins.some(p=>p.category==='spiritual') },
  { id:'all_cats', name:'Full Spectrum', desc:'Use all 8 categories at least once', emoji:'🎨', xp:150,
    check: ()=> distinctCatsUsed().size>=8 },
  { id:'journal_5', name:'Reflective', desc:'Write 5 entries with real journal text', emoji:'✍️', xp:80,
    check: ()=> journeyPins.filter(p=>(p.journal||'').length>20).length>=5 },
  { id:'bucket_5', name:'Big Dreamer', desc:'Add 5 places to your bucket list', emoji:'🗺️', xp:60,
    check: ()=> bucketList.length>=5 },
  { id:'five_star', name:'Unforgettable', desc:'Give a memory a 5-star rating', emoji:'⭐', xp:40,
    check: ()=> journeyPins.some(p=>p.rating===5) },
  { id:'xp_500', name:'Momentum', desc:'Reach 500 XP', emoji:'⚡', xp:0,
    check: ()=> (xpState.xp||0)>=500 },
  { id:'xp_1000', name:'Seasoned Traveler', desc:'Reach 1000 XP', emoji:'🏆', xp:0,
    check: ()=> (xpState.xp||0)>=1000 },
  { id:'oracle_chat', name:'Curious Mind', desc:'Ask the Oracle a question', emoji:'🔮', xp:25,
    check: ()=> !!xpState._oracleUsed },
];

function checkAchievements(){
  let newlyUnlocked = [];
  ACHIEVEMENTS.forEach(a=>{
    if(!unlockedAch.includes(a.id) && a.check()){
      unlockedAch.push(a.id);
      newlyUnlocked.push(a);
    }
  });
  if(newlyUnlocked.length){
    persistAch();
    newlyUnlocked.forEach(a=>{
      if(a.xp>0){ xpState.xp += a.xp; persistXP(); }
      toast(`🏆 Achievement: ${a.name}${a.xp>0?' +'+a.xp+'XP':''}`, '#a371f7');
    });
    renderXPBar();
  }
  return newlyUnlocked;
}

// ════════════════════════════════════════════════════════════════
// TOP XP PROGRESS BAR — thin, fixed, reuses .dft/.dfb pattern
// ════════════════════════════════════════════════════════════════
function injectXPBar(){
  if(document.getElementById('xpbar')) return;
  const bar = document.createElement('div');
  bar.id = 'xpbar';
  bar.innerHTML = `<div id="xpbar-fill"></div>`;
  document.body.appendChild(bar);
  renderXPBar();
}
function renderXPBar(){
  const fill = document.getElementById('xpbar-fill');
  if(!fill) return;
  const pct = Math.min(100, (xpIntoLevel()/200)*100);
  requestAnimationFrame(()=>{ fill.style.width = pct+'%'; });
  fill.title = `Level ${getLevel()} — ${xpState.xp||0} XP`;
}

// ════════════════════════════════════════════════════════════════
// HUB SHELL — reuses #sheet + #sheetbackdrop pattern exactly
// ════════════════════════════════════════════════════════════════
let hubView = 'menu'; // menu | timeline | bucket | achievements | constellation | oracle

function injectHubShell(){
  const root = document.getElementById('hubroot');
  root.innerHTML = `
    <div id="hubbackdrop"></div>
    <div id="hubsheet">
      <div class="shandle"></div>
      <div id="hubbody"></div>
    </div>
  `;
  document.getElementById('hubbackdrop').addEventListener('click', closeHub);
  // swipe-down close, same gesture pattern as host's #sheet
  let ty=0;
  const hs = document.getElementById('hubsheet');
  hs.addEventListener('touchstart', e=>{ty=e.touches[0].clientY}, {passive:true});
  hs.addEventListener('touchend', e=>{ if(e.changedTouches[0].clientY-ty>80) closeHub(); }, {passive:true});
}

function openHub(){
  hubView = 'menu';
  document.getElementById('hubsheet').classList.add('up');
  document.getElementById('hubbackdrop').classList.add('up');
  renderHub();
}
function closeHub(){
  document.getElementById('hubsheet').classList.remove('up');
  document.getElementById('hubbackdrop').classList.remove('up');
}
function goHub(view){ hubView = view; renderHub(); }

// ════════════════════════════════════════════════════════════════
// RENDER ROUTER
// ════════════════════════════════════════════════════════════════
function renderHub(){
  const body = document.getElementById('hubbody');
  if(hubView==='menu') body.innerHTML = renderMenu();
  else if(hubView==='timeline') body.innerHTML = renderTimeline();
  else if(hubView==='bucket') body.innerHTML = renderBucket();
  else if(hubView==='achievements') body.innerHTML = renderAchievements();
  else if(hubView==='constellation') body.innerHTML = renderConstellation();
  else if(hubView==='oracle') body.innerHTML = renderOracle();
  else if(hubView==='progress') body.innerHTML = renderProgress();
  else if(hubView==='pindetail') body.innerHTML = renderPinDetail(hubView_pinId);
  else if(hubView==='pinform') body.innerHTML = renderPinForm(hubView_editPin);
  else if(hubView==='bucketform') body.innerHTML = renderBucketForm(hubView_editBucket);
  wireHubBody();
}

let hubView_pinId = null;
let hubView_editPin = null;
let hubView_editBucket = null;

// ── MENU ──
function renderMenu(){
  const stats = computeStats();
  return `
    <div class="s-reg">Journey Hub</div>
    <div class="s-name">Your Travel Story</div>
    <div class="s-season">⚡ Level ${getLevel()} · ${xpState.xp||0} XP</div>

    <div class="s-stats" style="grid-template-columns:repeat(4,1fr)">
      <div class="ss"><div class="ssv">${stats.entries}</div><div class="ssl">Memories</div></div>
      <div class="ss"><div class="ssv">${stats.countries}</div><div class="ssl">Places</div></div>
      <div class="ss"><div class="ssv">${stats.bucket}</div><div class="ssl">Bucket List</div></div>
      <div class="ss"><div class="ssv">${stats.achievements}/${ACHIEVEMENTS.length}</div><div class="ssl">Badges</div></div>
    </div>

    <div class="wpt" style="margin-top:8px">Explore</div>
    <div class="hub-menu-grid">
      <button class="btn bsec hub-menu-item" data-go="timeline">🕐<span>Timeline</span></button>
      <button class="btn bsec hub-menu-item" data-go="bucket">🗺️<span>Bucket List</span></button>
      <button class="btn bsec hub-menu-item" data-go="achievements">🏆<span>Achievements</span></button>
      <button class="btn bsec hub-menu-item" data-go="constellation">✨<span>Constellation</span></button>
      <button class="btn bsec hub-menu-item" data-go="oracle">🔮<span>Ask Oracle</span></button>
      <button class="btn bsec hub-menu-item" data-go="progress">📋<span>Progress</span></button>
      <button class="btn bsec hub-menu-item" id="hub-new-pin">➕<span>New Memory</span></button>
    </div>

    <div class="sacts">
      <button class="btn bsec" id="hub-export">⬇ Export</button>
      <button class="btn bsec" id="hub-import">⬆ Import</button>
      <input type="file" id="hub-import-file" accept=".json" style="display:none">
    </div>
  `;
}

// ── TIMELINE ──
function renderTimeline(){
  if(!journeyPins.length){
    return backBtn('Timeline') + emptyState('🕐','No memories yet','Create your first pin to start your timeline.','hub-new-pin-empty');
  }
  const byYear = {};
  journeyPins.forEach(p=>{
    const y = p.date ? p.date.split('-')[0] : 'Undated';
    (byYear[y] = byYear[y]||[]).push(p);
  });
  const years = Object.keys(byYear).sort((a,b)=> a==='Undated'?1:b==='Undated'?-1:b-a);
  return backBtn('Timeline') + years.map(y=>`
    <div class="wpt" style="margin-top:14px">${y}</div>
    <div class="wpl">
      ${byYear[y].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p=>{
        const c = catById(p.category);
        return `
        <div class="wpi hub-pin-row" data-pin="${p.id}" style="cursor:pointer">
          <div class="wpleft"><div class="wpd" style="background:${c.color}"></div><div class="wpline"></div></div>
          <div class="wpinfo">
            <div class="wpn">${p.icon||c.emoji} ${esc(p.name)}<span class="wptag tc" style="background:${c.color}22;color:${c.color}">${c.label}</span></div>
            <div class="wps">${p.date||''}${p.journal?' · '+esc(p.journal.slice(0,60))+(p.journal.length>60?'…':''):''}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

// ── BUCKET LIST ──
function renderBucket(){
  if(!bucketList.length){
    return backBtn('Bucket List') + emptyState('🗺️','Nothing on your list yet','Add somewhere you dream of going.','hub-new-bucket-empty')
      + `<div class="sacts"><button class="btn bp" id="hub-new-bucket">+ Add Destination</button></div>`;
  }
  return backBtn('Bucket List') + `
    <div class="hub-card-grid">
      ${bucketList.map(b=>{
        const pr = PRIORITIES.find(p=>p.id===b.priority) || PRIORITIES[2];
        return `
        <div class="hub-card" data-bucket="${b.id}">
          <div class="hub-card-top">
            <span class="hub-card-emoji">${b.emoji||'📍'}</span>
            <span class="wptag tc" style="background:${pr.color}22;color:${pr.color}">${pr.label}</span>
          </div>
          <div class="wpn" style="margin-top:6px">${esc(b.name)}</div>
          <div class="wps">${esc(b.country||'')}${b.targetYear?' · '+b.targetYear:''}</div>
          ${b.why?`<div class="s-desc" style="margin:8px 0 0;font-size:12px">${esc(b.why)}</div>`:''}
          <div class="sacts" style="margin-top:10px">
            <button class="btn bd hub-mark-visited" data-id="${b.id}" style="flex:1;padding:8px;font-size:12px">✓ Mark Visited</button>
            <button class="btn bsec hub-edit-bucket" data-id="${b.id}" style="padding:8px 10px;font-size:12px">✏️</button>
            <button class="btn bsec hub-del-bucket" data-id="${b.id}" style="padding:8px 10px;font-size:12px;color:var(--red)">🗑</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="sacts"><button class="btn bp" id="hub-new-bucket">+ Add Destination</button></div>
  `;
}

// ── ACHIEVEMENTS ──
function renderAchievements(){
  return backBtn('Achievements') + `
    <div class="s-season">${unlockedAch.length} / ${ACHIEVEMENTS.length} unlocked</div>
    <div class="hub-ach-grid">
      ${ACHIEVEMENTS.map(a=>{
        const unlocked = unlockedAch.includes(a.id);
        return `
        <div class="hub-ach ${unlocked?'':'hub-ach-locked'}" data-ach="${a.id}" title="${unlocked?'':'Locked'}">
          <div class="hub-ach-emoji">${unlocked?a.emoji:'🔒'}</div>
          <div class="hub-ach-name">${a.name}</div>
          <div class="hub-ach-desc">${a.desc}</div>
          ${unlocked ? (a.xp>0?`<div class="hub-ach-xp">+${a.xp} XP</div>`:'') : `<span class="wptag tv">Locked</span>`}
        </div>`;
      }).join('')}
    </div>
  `;
}

// ── CONSTELLATION (canvas) ──
function renderConstellation(){
  if(!journeyPins.length){
    return backBtn('Constellation') + emptyState('✨','Nothing to map yet','Your memories will appear as stars here.','hub-new-pin-empty2');
  }
  return backBtn('Constellation') + `<canvas id="hub-constellation" style="width:100%;height:340px;border-radius:12px;display:block"></canvas>
    <div class="s-season" style="margin-top:8px;text-align:center">Tap a star to open that memory</div>`;
}
function drawConstellation(){
  const cv = document.getElementById('hub-constellation');
  if(!cv) return;
  const dpr = window.devicePixelRatio||1;
  const W = cv.offsetWidth, H = 340;
  cv.width = W*dpr; cv.height = H*dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr,dpr);

  // Deterministic semi-random positions per pin id (stable across re-renders)
  function hashPos(id){
    let h=0; for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i))>>>0;
    return { x: 30+(h%1000)/1000*(W-60), y: 30+((h>>10)%1000)/1000*(H-60) };
  }
  const nodes = journeyPins.map(p=>({ p, pos:hashPos(p.id), r: 4+(p.rating||3)*1.6, c: catById(p.category).color }));

  // Faint connecting lines between nearby nodes (purely aesthetic)
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth=1;
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const dx=nodes[i].pos.x-nodes[j].pos.x, dy=nodes[i].pos.y-nodes[j].pos.y;
      if(Math.sqrt(dx*dx+dy*dy) < 110){
        ctx.beginPath(); ctx.moveTo(nodes[i].pos.x,nodes[i].pos.y); ctx.lineTo(nodes[j].pos.x,nodes[j].pos.y); ctx.stroke();
      }
    }
  }
  // Nodes + labels
  nodes.forEach(n=>{
    ctx.beginPath(); ctx.arc(n.pos.x,n.pos.y,n.r,0,Math.PI*2);
    ctx.fillStyle = n.c; ctx.shadowColor=n.c; ctx.shadowBlur=8; ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,.7)'; ctx.font='10px -apple-system,sans-serif'; ctx.textAlign='center';
    ctx.fillText(`${n.p.icon||''} ${n.p.name}`.trim().slice(0,16), n.pos.x, n.pos.y+n.r+12);
  });

  cv._nodes = nodes;
  cv.onclick = (e)=>{
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX-rect.left, my = e.clientY-rect.top;
    const hit = cv._nodes.find(n=> Math.hypot(n.pos.x-mx, n.pos.y-my) < n.r+10);
    if(hit){ hubView_pinId = hit.p.id; goHub('pindetail'); }
  };
}

// ── ORACLE (rule-based local chat) ──
let oracleHistory = [];
function renderOracle(){
  return backBtn('Ask the Oracle') + `
    <div id="hub-oracle-msgs" class="hub-oracle-msgs">
      ${oracleHistory.length ? oracleHistory.map(m=>`
        <div class="hub-oracle-msg ${m.role}">${m.text}</div>
      `).join('') : `<div class="hub-oracle-msg oracle">🔮 Ask me anything about your journey — I read your real data.</div>`}
    </div>
    <div class="hub-oracle-chips">
      ${['Where have I been most?','Summarize my journey','What should I add to my bucket list?','What achievements have I unlocked?']
        .map(q=>`<button class="btn bsec hub-oracle-chip" style="padding:6px 12px;font-size:11px;flex:none">${q}</button>`).join('')}
    </div>
    <div class="mf" style="display:flex;gap:8px;margin-top:10px">
      <input type="text" id="hub-oracle-input" placeholder="Ask the Oracle…" style="flex:1">
      <button class="btn bp" id="hub-oracle-send" style="flex:none;padding:9px 16px">Send</button>
    </div>
  `;
}
function oracleAnswer(q){
  xpState._oracleUsed = true; persistXP(); checkAchievements();
  const s = computeStats();
  const ql = q.toLowerCase();
  if(ql.includes('where') && ql.includes('most')){
    const counts = {};
    journeyPins.forEach(p=>{ const l=(p.location||'Unknown').trim(); counts[l]=(counts[l]||0)+1; });
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    return top ? `You've logged the most memories in <b>${esc(top[0])}</b> (${top[1]} ${top[1]===1?'entry':'entries'}). Across all places, you've visited ${s.countries} distinct location${s.countries===1?'':'s'}.`
                : `You haven't logged any memories yet — once you do, I'll tell you where you go most.`;
  }
  if(ql.includes('summar')){
    return `You have <b>${s.entries}</b> memories across <b>${s.countries}</b> places, with an average rating of <b>${s.avgRating}★</b>. Your most-used category is <b>${s.topCategory}</b>. You're Level <b>${getLevel()}</b> with <b>${xpState.xp||0} XP</b> and <b>${s.achievements}/${ACHIEVEMENTS.length}</b> achievements unlocked.`;
  }
  if(ql.includes('bucket')){
    if(!bucketList.length) return `Your bucket list is empty. Categories you haven't logged a memory in yet might be a good place to start: ${CATS.filter(c=>!distinctCatsUsed().has(c.id)).map(c=>c.emoji+' '+c.label).join(', ')||'you\'ve covered them all!'}`;
    const must = bucketList.filter(b=>b.priority==='must').length;
    return `You have <b>${bucketList.length}</b> places on your bucket list, <b>${must}</b> marked "Must Visit". Consider planning your next trip around one of those soon!`;
  }
  if(ql.includes('achievement')){
    return `You've unlocked <b>${s.achievements} of ${ACHIEVEMENTS.length}</b> achievements. ${s.achievements<ACHIEVEMENTS.length ? 'Keep logging memories and exploring new categories to unlock more!' : 'You\'ve unlocked everything — incredible!'}`;
  }
  if(ql.includes('xp') || ql.includes('level')){
    return `You're at Level <b>${getLevel()}</b> with <b>${xpState.xp||0} XP</b> total — ${200-xpIntoLevel()} XP until your next level.`;
  }
  if(ql.includes('rating') || ql.includes('best')){
    const best = [...journeyPins].sort((a,b)=>(b.rating||0)-(a.rating||0))[0];
    return best ? `Your highest-rated memory is <b>${esc(best.name)}</b> at <b>${best.rating||0}★</b>${best.bestMemory?': "'+esc(best.bestMemory)+'"':''}.`
                : `Rate a memory and I'll be able to tell you your favorite.`;
  }
  return `I can tell you about where you've traveled most, summarize your journey, suggest bucket list ideas, or recap your achievements — just ask, or tap a suggestion below.`;
}

// ── PIN DETAIL ──
function renderPinDetail(id){
  const p = journeyPins.find(x=>x.id===id);
  if(!p) return backBtn('Timeline') + emptyState('❓','Not found','This memory may have been deleted.','');
  const c = catById(p.category);
  const mood = MOODS.find(m=>m.l===p.mood);
  return backBtn(null) + `
    <div class="s-reg">${c.label}${p.location?' · '+esc(p.location):''}</div>
    <div class="s-name">${p.icon||c.emoji} ${esc(p.name)}</div>
    <div class="s-season">${p.date||''}${p.duration?' · '+esc(p.duration):''}${mood?' · '+mood.e+' '+mood.l:''}</div>

    <div class="s-stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="ss"><div class="ssv">${'★'.repeat(p.rating||0)||'—'}</div><div class="ssl">Rating</div></div>
      <div class="ss"><div class="ssv">${p.cost?'₹'+esc(p.cost):'—'}</div><div class="ssl">Cost</div></div>
      <div class="ss"><div class="ssv">${(p.tags||'').split(',').filter(Boolean).length||0}</div><div class="ssl">Tags</div></div>
    </div>

    ${p.journal?`<div class="wpt">Journal</div><div class="s-desc">${esc(p.journal)}</div>`:''}
    ${p.bestMemory?`<div class="wpt">✨ Best Memory</div><div class="s-desc">${esc(p.bestMemory)}</div>`:''}
    ${p.lesson?`<div class="wpt">💡 Lesson Learned</div><div class="s-desc">${esc(p.lesson)}</div>`:''}
    ${p.tags?`<div class="wpt">Tags</div><div style="margin-bottom:14px">${p.tags.split(',').map(t=>t.trim()).filter(Boolean).map(t=>`<span class="wptag tv" style="margin:2px">${esc(t)}</span>`).join('')}</div>`:''}

    <div class="sacts">
      <button class="btn bp hub-edit-pin" data-id="${p.id}">✏️ Edit</button>
      <button class="btn bsec hub-del-pin" data-id="${p.id}" style="color:var(--red)">🗑</button>
    </div>
  `;
}

// ── PIN FORM (create/edit) ──
function renderPinForm(editing){
  const p = editing || {};
  return backBtn(null) + `
    <div class="s-name">${editing?'Edit Memory':'New Memory'}</div>
    <div class="mf"><label>Name *</label><input type="text" id="pf-name" value="${attr(p.name)}" placeholder="e.g. Goa Beach Trip"></div>
    <div class="mf"><label>Location / Country</label><input type="text" id="pf-location" value="${attr(p.location)}" placeholder="e.g. Goa, India"></div>
    <div style="display:flex;gap:10px">
      <div class="mf" style="flex:1"><label>Date Visited</label><input type="month" id="pf-date" value="${attr(p.date)}"></div>
      <div class="mf" style="flex:1"><label>Duration</label><input type="text" id="pf-duration" value="${attr(p.duration)}" placeholder="5 days"></div>
    </div>
    <div class="mf"><label>Icon (emoji)</label><input type="text" id="pf-icon" value="${attr(p.icon)}" maxlength="4" placeholder="📍"></div>
    <div class="mf"><label>Category</label>
      <div class="diff-select" style="flex-wrap:wrap;gap:6px" id="pf-cats">
        ${CATS.map(c=>`<div class="diff-opt hub-cat-opt ${p.category===c.id?'hub-cat-sel':''}" data-cat="${c.id}" style="flex:0 0 auto;padding:6px 10px;${p.category===c.id?`background:${c.color}22;border-color:${c.color};color:${c.color}`:''}">${c.emoji} ${c.label}</div>`).join('')}
      </div>
    </div>
    <div class="mf"><label>Mood</label>
      <div class="diff-select" style="flex-wrap:wrap;gap:6px" id="pf-moods">
        ${MOODS.map(m=>`<div class="diff-opt hub-mood-opt ${p.mood===m.l?'hub-cat-sel':''}" data-mood="${m.l}" style="flex:0 0 auto;padding:6px 10px">${m.e} ${m.l}</div>`).join('')}
      </div>
    </div>
    <div class="mf"><label>Your Rating</label><div class="stars" id="pf-stars">${[1,2,3,4,5].map(v=>`<span class="star ${p.rating>=v?'on':''}" data-v="${v}">★</span>`).join('')}</div></div>
    <div class="mf"><label>Journal Entry</label><textarea id="pf-journal" placeholder="What happened…">${esc(p.journal||'')}</textarea></div>
    <div class="mf"><label>✨ Best Memory</label><textarea id="pf-best" placeholder="The single best moment…">${esc(p.bestMemory||'')}</textarea></div>
    <div class="mf"><label>💡 Lesson Learned</label><textarea id="pf-lesson" placeholder="What you took away…">${esc(p.lesson||'')}</textarea></div>
    <div class="mf"><label>Tags (comma-separated)</label><input type="text" id="pf-tags" value="${attr(p.tags)}" placeholder="beach, solo, monsoon"></div>
    <div class="mf"><label>Approx. Cost</label><input type="text" id="pf-cost" value="${attr(p.cost)}" placeholder="15000"></div>

    <div class="sacts">
      ${editing?`<button class="btn bsec hub-del-pin" data-id="${p.id}" style="color:var(--red);flex:0 0 auto">🗑</button>`:''}
      <button class="btn bp" id="pf-save" style="flex:1">${editing?'✔ Save Changes':'✔ Create Memory'}</button>
    </div>
  `;
}

// ── BUCKET FORM ──
function renderBucketForm(editing){
  const b = editing || {};
  return backBtn(null) + `
    <div class="s-name">${editing?'Edit Destination':'New Destination'}</div>
    <div class="mf"><label>Name *</label><input type="text" id="bf-name" value="${attr(b.name)}" placeholder="e.g. Patagonia"></div>
    <div class="mf"><label>Country</label><input type="text" id="bf-country" value="${attr(b.country)}" placeholder="e.g. Argentina/Chile"></div>
    <div class="mf"><label>Icon (emoji)</label><input type="text" id="bf-icon" value="${attr(b.icon)}" maxlength="4" placeholder="🏔️"></div>
    <div class="mf"><label>Why I want to go</label><textarea id="bf-why" placeholder="What draws you there…">${esc(b.why||'')}</textarea></div>
    <div class="mf"><label>Priority</label>
      <div class="diff-select">
        ${PRIORITIES.map(p=>`<div class="diff-opt hub-pri-opt ${b.priority===p.id?'hub-cat-sel':''}" data-pri="${p.id}" style="${b.priority===p.id?`background:${p.color}22;border-color:${p.color};color:${p.color}`:''}">${p.label}</div>`).join('')}
      </div>
    </div>
    <div class="mf"><label>Target Year</label><input type="number" id="bf-year" value="${attr(b.targetYear)}" placeholder="2026"></div>
    <div class="sacts">
      ${editing?`<button class="btn bsec hub-del-bucket" data-id="${b.id}" style="color:var(--red);flex:0 0 auto">🗑</button>`:''}
      <button class="btn bp" id="bf-save" style="flex:1">${editing?'✔ Save Changes':'✔ Add to Bucket List'}</button>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════
// SHARED RENDER HELPERS
// ════════════════════════════════════════════════════════════════
function backBtn(title){
  return `<div class="hub-backrow">
    <button class="btn bsec" id="hub-back" style="padding:7px 12px;font-size:12px;flex:none">← Back</button>
    ${title?`<div class="hub-backtitle">${title}</div>`:''}
  </div>`;
}
function emptyState(emoji,title,sub,ctaId){
  return `<div class="hub-empty">
    <div class="hub-empty-emoji">${emoji}</div>
    <div class="hub-empty-title">${title}</div>
    <div class="hub-empty-sub">${sub}</div>
    ${ctaId?`<button class="btn bp" id="${ctaId}" style="margin-top:14px">+ Get Started</button>`:''}
  </div>`;
}
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function attr(s){ return esc(s); }

function computeStats(){
  const ratings = journeyPins.filter(p=>p.rating).map(p=>p.rating);
  const avgRating = ratings.length ? (ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1) : '—';
  const catCounts = {};
  journeyPins.forEach(p=>{ if(p.category) catCounts[p.category]=(catCounts[p.category]||0)+1; });
  const topCatId = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  return {
    entries: journeyPins.length,
    countries: distinctLocations().size,
    bucket: bucketList.length,
    achievements: unlockedAch.length,
    xp: xpState.xp||0,
    avgRating,
    topCategory: topCatId ? catById(topCatId).label : '—',
  };
}

// ════════════════════════════════════════════════════════════════
// EVENT WIRING (delegated per render since innerHTML is replaced each time)
// ════════════════════════════════════════════════════════════════
// ── PROGRESS TRACKER ──
const CIRCUITS = [
  {
    id: 'sevensummits',
    name: 'Seven Summits',
    emoji: '🌐',
    color: '#f97316',
    desc: 'The highest peak on every continent',
    ids: ['ss01','ss02','ss03','ss04','ss05','ss06','ss07'],
    labels: ['Everest (Asia)','Aconcagua (S.America)','Denali (N.America)','Kilimanjaro (Africa)','Elbrus (Europe)','Vinson (Antarctica)','Puncak Jaya (Oceania)']
  },
  {
    id: 'panchkedar',
    name: 'Panch Kedar',
    emoji: '🕉️',
    color: '#d29922',
    desc: 'Five sacred Shiva shrines of Garhwal',
    ids: ['sp01','sp02','sp03','sp04','sp05'],
    labels: ['Kedarnath (Hump)','Tungnath (Arms)','Rudranath (Face)','Madhyamaheshwar (Navel)','Kalpeshwar (Hair)']
  },
  {
    id: 'saptbadri',
    name: 'Sapt Badri',
    emoji: '🛕',
    color: '#388bfd',
    desc: 'Seven sacred Vishnu shrines of Uttarakhand',
    ids: ['sp06','sp07','sp08','sp09','sp10','sp11','sp12'],
    labels: ['Badrinath (Badri Vishal)','Yogadhyan Badri','Bhavishya Badri','Vridha Badri','Adi Badri','Dhyan Badri','Ardha Badri']
  },
  {
    id: 'panchkailash',
    name: 'Panch Kailash',
    emoji: '🏔️',
    color: '#a371f7',
    desc: 'Five sacred Kailash peaks of the Himalaya',
    ids: ['sp13','sp14','sp15','sp16','sp17'],
    labels: ['Mt Kailash (Tibet)','Adi Kailash (Chhota)','Shrikhand Mahadev','Kinnaur Kailash','Manimahesh Kailash']
  },
  {
    id: 'jyotirlinga',
    name: '12 Jyotirlingas',
    emoji: '🪔',
    color: '#f85149',
    desc: 'Twelve self-manifested Shiva shrines of India',
    ids: ['sp18','sp19','sp20','sp21','sp22','sp23','sp24','sp25','sp26','sp27','sp28','sp01'],
    labels: ['Somnath','Mallikarjuna','Mahakaleshwar','Omkareshwar','Kedarnath','Bhimashankar','Kashi Vishwanath','Trimbakeshwar','Vaidyanath','Nageshwar','Rameshwaram','Grishneshwar']
  }
];

function progressDone(ids){
  const lg = JSON.parse(localStorage.getItem('sl3_logged')||'{}');
  return ids.filter(id => lg[id]);
}

function renderProgress(){
  const lg = JSON.parse(localStorage.getItem('sl3_logged')||'{}');

  // Hero summary — total unique circuits with at least 1 done
  const totalDone = CIRCUITS.reduce((acc, c) => {
    const done = c.ids.filter(id=>lg[id]).length;
    return acc + (done===c.ids.length ? 1 : 0);
  }, 0);

  const circuitsHtml = CIRCUITS.map(c => {
    const done = c.ids.filter(id=>lg[id]);
    const pct = Math.round(done.length / c.ids.length * 100);
    const complete = done.length === c.ids.length;

    const itemsHtml = c.ids.map((id, i) => {
      const isLogged = !!lg[id];
      const trek = typeof TREKS !== 'undefined' ? [...TREKS].find(t=>t.id===id) : null;
      const label = c.labels[i] || (trek ? trek.name : id);
      const date = isLogged && lg[id].date ? lg[id].date : '';
      const rating = isLogged && lg[id].rating ? '★'.repeat(lg[id].rating) : '';
      return `
        <div class="prog-item ${isLogged?'prog-done':''}" data-trekid="${id}">
          <div class="prog-check" style="background:${isLogged ? c.color : 'transparent'};border-color:${isLogged ? c.color : 'rgba(255,255,255,.2)'}">
            ${isLogged ? '✓' : ''}
          </div>
          <div class="prog-item-info">
            <div class="prog-item-name">${isLogged ? '<s style="opacity:.5">'+esc(label)+'</s>' : esc(label)}</div>
            ${isLogged ? `<div class="prog-item-meta">${date}${rating ? ' · '+rating : ''}</div>` : ''}
          </div>
          ${trek ? `<div class="prog-item-jump" data-trekid="${id}" title="View on map">›</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="prog-circuit ${complete?'prog-circuit-complete':''}">
        <div class="prog-circuit-head" data-circuit="${c.id}">
          <div class="prog-circuit-left">
            <span class="prog-emoji">${c.emoji}</span>
            <div>
              <div class="prog-circuit-name">${c.name} ${complete ? '<span class="prog-badge-done">COMPLETE ✦</span>' : ''}</div>
              <div class="prog-circuit-sub">${c.desc}</div>
            </div>
          </div>
          <div class="prog-circuit-right">
            <div class="prog-fraction" style="color:${c.color}">${done.length}<span style="color:var(--mute);font-weight:400">/${c.ids.length}</span></div>
            <div class="prog-chev" data-circuit="${c.id}">›</div>
          </div>
        </div>
        <div class="prog-bar-wrap">
          <div class="prog-bar-fill" style="width:${pct}%;background:${c.color};box-shadow:0 0 8px ${c.color}55"></div>
        </div>
        <div class="prog-list prog-list-${c.id}" style="display:none">
          ${itemsHtml}
        </div>
      </div>`;
  }).join('');

  return backBtn('Progress Tracker') + `
    <div style="margin-bottom:16px">
      <div class="s-desc" style="margin:0 0 14px">${totalDone} of ${CIRCUITS.length} circuits completed. Tap any circuit to expand its checklist — items are checked automatically when you log a summit.</div>
      <div class="s-stats" style="grid-template-columns:repeat(${CIRCUITS.length},1fr);gap:6px">
        ${CIRCUITS.map(c=>{
          const d = c.ids.filter(id=>lg[id]).length;
          return `<div class="ss" style="border-color:${d===c.ids.length?c.color:'var(--bord)'}">
            <div class="ssv" style="color:${c.color}">${d}/${c.ids.length}</div>
            <div class="ssl">${c.emoji}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="prog-circuits">${circuitsHtml}</div>
  `;
}

function wireProgress(body){
  // Toggle each circuit's expanded list
  body.querySelectorAll('[data-circuit]').forEach(el => {
    el.addEventListener('click', e => {
      const id = el.dataset.circuit;
      const list = body.querySelector(`.prog-list-${id}`);
      const chev = body.querySelector(`.prog-chev[data-circuit="${id}"]`);
      if(!list) return;
      const open = list.style.display !== 'none';
      list.style.display = open ? 'none' : 'block';
      if(chev) chev.style.transform = open ? '' : 'rotate(90deg)';
    });
  });

  // Jump to trek on map
  body.querySelectorAll('.prog-item-jump').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.trekid;
      const trek = typeof TREKS !== 'undefined' ? [...TREKS].find(t=>t.id===id) : null;
      if(!trek) return;
      closeHub();
      if(typeof openSheet === 'function') setTimeout(()=>openSheet(trek), 200);
    });
  });

  // Tap item row also jumps (but not the jump button itself)
  body.querySelectorAll('.prog-item[data-trekid]').forEach(item => {
    item.addEventListener('click', e => {
      if(e.target.classList.contains('prog-item-jump')) return;
      const id = item.dataset.trekid;
      const trek = typeof TREKS !== 'undefined' ? [...TREKS].find(t=>t.id===id) : null;
      if(!trek) return;
      closeHub();
      if(typeof openSheet === 'function') setTimeout(()=>openSheet(trek), 200);
    });
  });
}

function wireHubBody(){
  const body = document.getElementById('hubbody');

  // Progress tracker wiring
  if(hubView==='progress') wireProgress(body);

  body.querySelector('#hub-back')?.addEventListener('click', ()=>{
    if(hubView==='pindetail' || hubView==='pinform') goHub('timeline');
    else if(hubView==='bucketform') goHub('bucket');
    else goHub('menu');
  });

  // Menu navigation
  body.querySelectorAll('[data-go]').forEach(el=>{
    el.addEventListener('click', ()=> goHub(el.dataset.go));
  });
  body.querySelector('#hub-new-pin')?.addEventListener('click', ()=>{ hubView_editPin=null; goHub('pinform'); });
  body.querySelector('#hub-new-pin-empty')?.addEventListener('click', ()=>{ hubView_editPin=null; goHub('pinform'); });
  body.querySelector('#hub-new-pin-empty2')?.addEventListener('click', ()=>{ hubView_editPin=null; goHub('pinform'); });
  body.querySelector('#hub-new-bucket')?.addEventListener('click', ()=>{ hubView_editBucket=null; goHub('bucketform'); });
  body.querySelector('#hub-new-bucket-empty')?.addEventListener('click', ()=>{ hubView_editBucket=null; goHub('bucketform'); });

  // Timeline row -> detail
  body.querySelectorAll('.hub-pin-row').forEach(el=>{
    el.addEventListener('click', ()=>{ hubView_pinId = el.dataset.pin; goHub('pindetail'); });
  });

  // Pin detail actions
  body.querySelector('.hub-edit-pin')?.addEventListener('click', (e)=>{
    hubView_editPin = journeyPins.find(p=>p.id===e.currentTarget.dataset.id);
    goHub('pinform');
  });
  body.querySelectorAll('.hub-del-pin').forEach(el=>{
    el.addEventListener('click', (e)=>{
      const id = e.currentTarget.dataset.id;
      if(confirm('Delete this memory? This cannot be undone.')){
        journeyPins = journeyPins.filter(p=>p.id!==id);
        persistPins();
        toast('Memory deleted', '#7d8590');
        goHub('timeline');
      }
    });
  });

  // Pin form
  if(hubView==='pinform'){
    let selCat = (hubView_editPin && hubView_editPin.category) || null;
    let selMood = (hubView_editPin && hubView_editPin.mood) || null;
    let selRating = (hubView_editPin && hubView_editPin.rating) || 0;
    body.querySelectorAll('.hub-cat-opt').forEach(el=>{
      el.addEventListener('click', ()=>{
        selCat = el.dataset.cat;
        body.querySelectorAll('.hub-cat-opt').forEach(o=>{ o.classList.remove('hub-cat-sel'); o.style.cssText=''; });
        const c = catById(selCat);
        el.classList.add('hub-cat-sel'); el.style.cssText=`background:${c.color}22;border-color:${c.color};color:${c.color}`;
      });
    });
    body.querySelectorAll('.hub-mood-opt').forEach(el=>{
      el.addEventListener('click', ()=>{
        selMood = el.dataset.mood;
        body.querySelectorAll('.hub-mood-opt').forEach(o=>o.classList.remove('hub-cat-sel'));
        el.classList.add('hub-cat-sel');
      });
    });
    body.querySelectorAll('#pf-stars .star').forEach(s=>{
      s.addEventListener('click', ()=>{
        selRating = +s.dataset.v;
        body.querySelectorAll('#pf-stars .star').forEach(x=>x.classList.toggle('on', +x.dataset.v<=selRating));
      });
    });
    body.querySelector('#pf-save')?.addEventListener('click', ()=>{
      const name = body.querySelector('#pf-name').value.trim();
      if(!name){ toast('Please enter a name', '#f85149'); return; }
      const data = {
        id: hubView_editPin ? hubView_editPin.id : uid('pin'),
        name,
        location: body.querySelector('#pf-location').value.trim(),
        date: body.querySelector('#pf-date').value,
        duration: body.querySelector('#pf-duration').value.trim(),
        icon: body.querySelector('#pf-icon').value.trim(),
        category: selCat || 'visited',
        mood: selMood,
        rating: selRating,
        journal: body.querySelector('#pf-journal').value.trim(),
        bestMemory: body.querySelector('#pf-best').value.trim(),
        lesson: body.querySelector('#pf-lesson').value.trim(),
        tags: body.querySelector('#pf-tags').value.trim(),
        cost: body.querySelector('#pf-cost').value.trim(),
      };
      const isEdit = !!hubView_editPin;
      if(isEdit){
        const idx = journeyPins.findIndex(p=>p.id===data.id);
        if(idx!==-1) journeyPins[idx]=data;
        addXP(10, 'edited a memory');
      } else {
        journeyPins.push(data);
        addXP(50, 'new memory created');
      }
      persistPins();
      toast(isEdit?'Memory updated!':'Memory created!', '#2ea043');
      hubView_pinId = data.id;
      goHub('pindetail');
    });
  }

  // Bucket list actions
  body.querySelectorAll('.hub-mark-visited').forEach(el=>{
    el.addEventListener('click', (e)=>{
      const id = e.currentTarget.dataset.id;
      const b = bucketList.find(x=>x.id===id);
      if(!b) return;
      bucketList = bucketList.filter(x=>x.id!==id);
      persistBucket();
      addXP(30, 'marked a destination visited');
      toast(`🎉 ${b.name} marked visited! Consider adding it as a memory.`, '#2ea043');
      goHub('bucket');
    });
  });
  body.querySelectorAll('.hub-edit-bucket').forEach(el=>{
    el.addEventListener('click', (e)=>{
      hubView_editBucket = bucketList.find(b=>b.id===e.currentTarget.dataset.id);
      goHub('bucketform');
    });
  });
  body.querySelectorAll('.hub-del-bucket').forEach(el=>{
    el.addEventListener('click', (e)=>{
      const id = e.currentTarget.dataset.id;
      if(confirm('Remove this from your bucket list?')){
        bucketList = bucketList.filter(b=>b.id!==id);
        persistBucket();
        toast('Removed from bucket list', '#7d8590');
        goHub('bucket');
      }
    });
  });

  // Bucket form
  if(hubView==='bucketform'){
    let selPri = (hubView_editBucket && hubView_editBucket.priority) || 'dream';
    body.querySelectorAll('.hub-pri-opt').forEach(el=>{
      el.addEventListener('click', ()=>{
        selPri = el.dataset.pri;
        const pr = PRIORITIES.find(p=>p.id===selPri);
        body.querySelectorAll('.hub-pri-opt').forEach(o=>{ o.classList.remove('hub-cat-sel'); o.style.cssText=''; });
        el.classList.add('hub-cat-sel'); el.style.cssText=`background:${pr.color}22;border-color:${pr.color};color:${pr.color}`;
      });
    });
    body.querySelector('#bf-save')?.addEventListener('click', ()=>{
      const name = body.querySelector('#bf-name').value.trim();
      if(!name){ toast('Please enter a name', '#f85149'); return; }
      const data = {
        id: hubView_editBucket ? hubView_editBucket.id : uid('bucket'),
        name,
        country: body.querySelector('#bf-country').value.trim(),
        icon: body.querySelector('#bf-icon').value.trim(),
        why: body.querySelector('#bf-why').value.trim(),
        priority: selPri,
        targetYear: body.querySelector('#bf-year').value.trim(),
      };
      const isEdit = !!hubView_editBucket;
      if(isEdit){
        const idx = bucketList.findIndex(b=>b.id===data.id);
        if(idx!==-1) bucketList[idx]=data;
      } else {
        bucketList.push(data);
        addXP(20, 'added to bucket list');
      }
      persistBucket();
      toast(isEdit?'Destination updated!':'Added to bucket list!', '#2ea043');
      goHub('bucket');
    });
  }

  // Achievements click -> toast detail
  body.querySelectorAll('.hub-ach').forEach(el=>{
    el.addEventListener('click', ()=>{
      const a = ACHIEVEMENTS.find(x=>x.id===el.dataset.ach);
      if(!a) return;
      const unlocked = unlockedAch.includes(a.id);
      toast(unlocked ? `${a.emoji} ${a.name}: ${a.desc}` : `🔒 ${a.desc}`, unlocked?'#a371f7':'#7d8590');
    });
  });

  // Constellation canvas
  if(hubView==='constellation') setTimeout(drawConstellation, 30);

  // Oracle chat
  if(hubView==='oracle'){
    const send = ()=>{
      const inp = body.querySelector('#hub-oracle-input');
      const q = inp.value.trim();
      if(!q) return;
      oracleHistory.push({role:'user', text: esc(q)});
      inp.value='';
      renderOracleMsgs();
      const msgsEl = body.querySelector('#hub-oracle-msgs');
      const typing = document.createElement('div');
      typing.className = 'hub-oracle-msg oracle hub-oracle-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      msgsEl.appendChild(typing);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      setTimeout(()=>{
        typing.remove();
        oracleHistory.push({role:'oracle', text: oracleAnswer(q)});
        renderOracleMsgs();
      }, 650);
    };
    body.querySelector('#hub-oracle-send')?.addEventListener('click', send);
    body.querySelector('#hub-oracle-input')?.addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });
    body.querySelectorAll('.hub-oracle-chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        body.querySelector('#hub-oracle-input').value = chip.textContent;
        send();
      });
    });
  }

  // Export / Import
  body.querySelector('#hub-export')?.addEventListener('click', exportData);
  body.querySelector('#hub-import')?.addEventListener('click', ()=> body.querySelector('#hub-import-file').click());
  body.querySelector('#hub-import-file')?.addEventListener('change', importData);
}

function renderOracleMsgs(){
  const el = document.getElementById('hub-oracle-msgs');
  if(!el) return;
  el.innerHTML = oracleHistory.map(m=>`<div class="hub-oracle-msg ${m.role}">${m.text}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ════════════════════════════════════════════════════════════════
// EXPORT / IMPORT
// ════════════════════════════════════════════════════════════════
function exportData(){
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'SummitLog Journey Hub',
    version: 1,
    pins: journeyPins,
    bucketList: bucketList,
    xp: xpState,
    achievements: unlockedAch,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `summitlog-journey-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Exported! Check your downloads.', '#2ea043');
}
function importData(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      const newPins = (data.pins||[]).filter(p=>!journeyPins.some(ex=>ex.id===p.id));
      const newBucket = (data.bucketList||[]).filter(b=>!bucketList.some(ex=>ex.id===b.id));
      if(!confirm(`Import ${newPins.length} new memories and ${newBucket.length} new bucket list items? Existing data won't be touched.`)) return;
      journeyPins = journeyPins.concat(newPins);
      bucketList = bucketList.concat(newBucket);
      if(data.xp && typeof data.xp.xp === 'number'){ xpState.xp = Math.max(xpState.xp||0, data.xp.xp); }
      persistPins(); persistBucket(); persistXP();
      checkAchievements();
      renderXPBar();
      toast(`Imported ${newPins.length} memories, ${newBucket.length} bucket items!`, '#2ea043');
      goHub('menu');
    }catch(err){
      toast('Import failed — invalid file', '#f85149');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ════════════════════════════════════════════════════════════════
// SEARCH EXTENSION — augments host's existing #srch / #sres
// ════════════════════════════════════════════════════════════════
function extendHostSearch(){
  const srch = document.getElementById('srch');
  const sres = document.getElementById('sres');
  if(!srch || !sres) return;
  const hostHandler = srch.oninput;
  srch.oninput = function(){
    if(hostHandler) hostHandler.call(this);
    const q = srch.value.trim().toLowerCase();
    if(!q) return;
    const pinHits = journeyPins.filter(p=>
      (p.name||'').toLowerCase().includes(q) ||
      (p.location||'').toLowerCase().includes(q) ||
      (p.tags||'').toLowerCase().includes(q) ||
      (p.journal||'').toLowerCase().includes(q)
    ).slice(0,5);
    const bucketHits = bucketList.filter(b=>
      (b.name||'').toLowerCase().includes(q) ||
      (b.country||'').toLowerCase().includes(q)
    ).slice(0,3);
    if(!pinHits.length && !bucketHits.length) return;

    const extra = [
      ...pinHits.map(p=>`<div class="sri hub-search-hit" data-kind="pin" data-id="${p.id}"><span class="sri-ico">${p.icon||catById(p.category).emoji}</span><div><div class="sri-name">${esc(p.name)}</div><div class="sri-meta">${esc(p.location||'')}${p.date?' · '+p.date:''} · ${catById(p.category).label}</div></div></div>`),
      ...bucketHits.map(b=>`<div class="sri hub-search-hit" data-kind="bucket" data-id="${b.id}"><span class="sri-ico">${b.icon||'🗺️'}</span><div><div class="sri-name">${esc(b.name)}</div><div class="sri-meta">Bucket List · ${PRIORITIES.find(p=>p.id===b.priority)?.label||''}</div></div></div>`),
    ].join('');

    if(sres.style.display==='block' || sres.innerHTML){
      sres.innerHTML += extra;
    } else {
      sres.innerHTML = extra;
    }
    sres.style.display = 'block';

    sres.querySelectorAll('.hub-search-hit').forEach(el=>{
      el.onclick = (e)=>{
        e.stopPropagation();
        sres.style.display='none';
        if(el.dataset.kind==='pin'){ hubView_pinId = el.dataset.id; }
        else { hubView_editBucket = bucketList.find(b=>b.id===el.dataset.id); }
        openHub();
        goHub(el.dataset.kind==='pin' ? 'pindetail' : 'bucketform');
      };
    });
  };
}

// ════════════════════════════════════════════════════════════════
// STATS EXTENSION — host badge already exists; we just hook into open
// ════════════════════════════════════════════════════════════════
// (Host's #bdg already shows trek stats + its own toast on click — left
//  untouched per instructions. Journey stats live in the Hub menu instead.)

// ════════════════════════════════════════════════════════════════
// INJECT NEW CSS — scoped, reuses var(--tokens), no new palette/fonts
// ════════════════════════════════════════════════════════════════
function injectCSS(){
  const css = `
#xpbar{position:fixed;top:0;left:0;right:0;height:3px;z-index:1500;background:rgba(255,255,255,.06);pointer-events:none}
#xpbar-fill{height:100%;width:0%;background:linear-gradient(90deg,#a371f7,#f97316);transition:width .6s cubic-bezier(.22,1,.36,1);box-shadow:0 0 8px rgba(163,113,247,.6)}

#hubbackdrop{position:fixed;inset:0;z-index:1850;background:rgba(0,0,0,0);pointer-events:none;transition:background .4s ease}
#hubbackdrop.up{background:rgba(0,0,0,.5);pointer-events:auto}
#hubsheet{
  position:fixed;bottom:-100%;left:0;right:0;z-index:1900;
  background:var(--surf);border-top:1px solid var(--bord);border-radius:22px 22px 0 0;
  transition:bottom .42s cubic-bezier(.32,.72,0,1);max-height:84dvh;overflow-y:auto;
  box-shadow:0 -16px 50px rgba(0,0,0,.55), 0 -2px 0 rgba(163,113,247,.5);
}
#hubsheet.up{bottom:54px}
#hubbody{padding:16px 18px 32px;animation:hubBodyIn .3s ease backwards .05s}
@keyframes hubBodyIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

.hub-backrow{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.hub-backtitle{font-size:16px;font-weight:800;color:var(--txt)}

.hub-menu-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px}
.hub-menu-item{flex-direction:column;gap:6px;padding:18px 10px;font-size:24px;height:auto}
.hub-menu-item span{font-size:11px;font-weight:600;color:var(--mute)}

.hub-empty{text-align:center;padding:36px 16px}
.hub-empty-emoji{font-size:40px;margin-bottom:10px}
.hub-empty-title{font-size:15px;font-weight:700;color:var(--txt)}
.hub-empty-sub{font-size:12px;color:var(--mute);margin-top:4px}

.hub-card-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px}
.hub-card{background:rgba(255,255,255,.04);border:1px solid var(--bord);border-radius:12px;padding:12px}
.hub-card-top{display:flex;align-items:center;justify-content:space-between}
.hub-card-emoji{font-size:22px}

.hub-ach-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:12px}
.hub-ach{background:rgba(255,255,255,.04);border:1px solid var(--bord);border-radius:12px;padding:12px;text-align:center;cursor:pointer;transition:transform .15s ease}
.hub-ach:active{transform:scale(.96)}
.hub-ach-locked{opacity:.45}
.hub-ach-emoji{font-size:26px;margin-bottom:4px}
.hub-ach-name{font-size:12px;font-weight:700;color:var(--txt)}
.hub-ach-desc{font-size:10px;color:var(--mute);margin-top:2px}
.hub-ach-xp{font-size:10px;color:var(--pur);font-weight:700;margin-top:6px}

.hub-cat-sel{}
.hub-oracle-msgs{max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:4px 0;margin-bottom:10px}
.hub-oracle-msg{font-size:13px;line-height:1.6;padding:10px 12px;border-radius:12px;max-width:88%}
.hub-oracle-msg.oracle{background:rgba(163,113,247,.1);border:1px solid rgba(163,113,247,.25);align-self:flex-start}
.hub-oracle-msg.user{background:rgba(249,115,22,.12);border:1px solid rgba(249,115,22,.25);align-self:flex-end;color:var(--txt)}
.hub-oracle-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}
.hub-oracle-typing span{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--pur);margin-right:3px;animation:hubBounce 1s infinite}
.hub-oracle-typing span:nth-child(2){animation-delay:.15s}
.hub-oracle-typing span:nth-child(3){animation-delay:.3s}
@keyframes hubBounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}

/* ── PROGRESS TRACKER ── */
.prog-circuits{display:flex;flex-direction:column;gap:10px;padding-bottom:24px}
.prog-circuit{background:rgba(255,255,255,.04);border:1px solid var(--bord);border-radius:14px;overflow:hidden;transition:border-color .2s}
.prog-circuit-complete{border-color:rgba(46,160,67,.35)!important;background:rgba(46,160,67,.04)!important}
.prog-circuit-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 10px;cursor:pointer;user-select:none}
.prog-circuit-left{display:flex;align-items:center;gap:10px}
.prog-emoji{font-size:22px;flex-shrink:0}
.prog-circuit-name{font-size:14px;font-weight:700;color:var(--txt);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.prog-circuit-sub{font-size:11px;color:var(--mute);margin-top:1px}
.prog-circuit-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.prog-fraction{font-size:18px;font-weight:800;font-family:monospace;line-height:1}
.prog-chev{font-size:18px;color:var(--mute);transition:transform .22s cubic-bezier(.34,1.56,.64,1);line-height:1}
.prog-bar-wrap{height:5px;background:rgba(255,255,255,.07);margin:0 14px 12px;border-radius:3px;overflow:hidden}
.prog-bar-fill{height:100%;border-radius:3px;transition:width 1s cubic-bezier(.16,1,.3,1)}
.prog-badge-done{font-size:9px;padding:2px 7px;border-radius:8px;background:rgba(46,160,67,.18);color:#4ade80;font-weight:700;letter-spacing:.5px}
.prog-list{padding:0 10px 10px}
.prog-item{display:flex;align-items:center;gap:10px;padding:9px 6px;border-radius:10px;cursor:pointer;transition:background .15s,transform .1s}
.prog-item:hover{background:rgba(255,255,255,.05)}
.prog-item:active{transform:scale(.98)}
.prog-check{width:20px;height:20px;border-radius:50%;border:2px solid;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;transition:background .25s,border-color .25s}
.prog-item-info{flex:1;min-width:0}
.prog-item-name{font-size:13px;font-weight:500;color:var(--txt)}
.prog-item-meta{font-size:10px;color:var(--mute);margin-top:1px;font-family:monospace}
.prog-item-jump{font-size:18px;color:var(--mute);flex-shrink:0;padding:0 4px;transition:color .15s,transform .15s}
.prog-item:hover .prog-item-jump{color:var(--ora);transform:translateX(2px)}
.prog-done .prog-item-name{opacity:.65}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

// ════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════
whenHostReady(()=>{
  injectCSS();
  injectXPBar();
  injectHubShell();
  extendHostSearch();
  checkAchievements(); // catch any retroactively-met conditions on load

  window.JourneyHub = { open: openHub, close: closeHub };
});

})();
