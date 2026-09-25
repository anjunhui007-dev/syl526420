const $ = (selector) => document.querySelector(selector);

const screens = { home: $('#home-screen'), game: $('#game-screen'), result: $('#result-screen'), ranking: $('#ranking-screen'), about: $('#about-screen') };
const playfield = $('#playfield');
const targetLayer = $('#target-layer');
const projectileLayer = $('#projectile-layer');
const pauseModal = $('#pause-modal');
const assets = window.HIT_ASSETS;
const weapons = [
  { name: '돼지', asset: assets.projectileNew0, hit: 'pig' },
  { name: '똥', asset: assets.projectileNew1, hit: 'poo' },
  { name: '맨홀뚜껑', asset: assets.projectileNew2, hit: 'manhole' },
  { name: '돌', asset: assets.projectileNew3, hit: 'rock' },
  { name: '리산성', asset: assets.projectileNew4, hit: 'risan' },
];
const targetTypes = [
  { key: 'normal', size: 86, points: 10, weight: 44 },
  { key: 'small', size: 86, points: 10, weight: 20 },
  { key: 'big', size: 86, points: 10, weight: 14 },
  { key: 'trap', size: 86, points: -25, weight: 13 },
  { key: 'trickster', size: 86, points: 10, weight: 9 },
];
const targetAssets = [
  { src: assets.targetNew0 }, { src: assets.targetNew1 }, { src: assets.targetNew2 }, { src: assets.targetNew3 },
  { src: assets.targetNew4 }, { src: assets.targetNew5 }, { src: assets.targetNew6 }, { src: assets.targetNew7 },
];
const trapRunFrames = [assets.trapRun0, assets.trapRun1, assets.trapRun2];
const state = { active: false, paused: false, startedAt: 0, pauseStartedAt: 0, pausedTotal: 0, score: 0, hits: 0, targets: [], projectiles: [], spawnAt: 0, raf: null, loadedWeapon: null };
let nextId = 1;

function showScreen(name) { Object.entries(screens).forEach(([key, node]) => node.classList.toggle('active', key === name)); }
function random(array) { return array[Math.floor(Math.random() * array.length)]; }
function image(src, className = '') { const node = document.createElement('img'); node.src = src; node.className = className; node.alt = ''; node.draggable = false; return node; }
function updateLoadedProjectile() { $('#loaded-projectile').replaceChildren(image(state.loadedWeapon.asset)); }
function projectileOverlapsTarget(target, centerX, centerY) {
  const half = 48;
  return centerX + half > target.x && centerX - half < target.x + target.size && centerY + half > target.y && centerY - half < target.y + target.size;
}
function isDoubleEvent(now) { return gameTime(now) >= 60000; }
function scoreMultiplier(now) { return isDoubleEvent(now) ? 2 : 1; }
function weightedTarget(now) {
  const doubleEvent = isDoubleEvent(now);
  const weighted = targetTypes.map((item) => ({ ...item, weight: item.weight * (doubleEvent && (item.key === 'trap' || item.key === 'trickster') ? 2 : 1) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  return weighted.find((item) => (roll -= item.weight) <= 0) || weighted[0];
}
function formatTime(milliseconds) { const sec = Math.max(0, Math.ceil(milliseconds / 1000)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
function gameTime(now) { return now - state.startedAt - state.pausedTotal; }
function updateHud(now) { $('#score-value').textContent = state.score; $('#timer-value').textContent = formatTime(90000 - gameTime(now)); $('#double-event-label').textContent = isDoubleEvent(now) ? '점수 2배!' : ''; }

function resetGame() {
  cancelAnimationFrame(state.raf); targetLayer.replaceChildren(); projectileLayer.replaceChildren();
  Object.assign(state, { active: true, paused: false, startedAt: performance.now(), pauseStartedAt: 0, pausedTotal: 0, score: 0, hits: 0, targets: [], projectiles: [], spawnAt: 0, loadedWeapon: random(weapons) });
  pauseModal.classList.remove('open'); pauseModal.setAttribute('aria-hidden', 'true');
  updateLoadedProjectile(); showScreen('game'); state.raf = requestAnimationFrame(tick);
}

function spawnTarget(now) {
  const type = weightedTarget(now); const rect = playfield.getBoundingClientRect(); const edgeRoll = Math.random();
  const entry = edgeRoll < .72 ? (Math.random() < .5 ? 'left' : 'right') : 'top';
  const rareLowerRoute = Math.random() < .05; const routeBottom = rareLowerRoute ? rect.height - 145 : Math.max(165, rect.height * .58);
  let x, y, exitX, exitY;
  const speed = (36 + Math.random() * 30 + Math.min(gameTime(now) / 1500, 30)) * 1.25 * (isDoubleEvent(now) ? 1.3 : 1) * (type.key === 'small' ? 1.28 : 1);
  if (entry === 'left' || entry === 'right') {
    x = entry === 'left' ? -type.size : rect.width + type.size;
    y = 88 + Math.random() * Math.max(30, routeBottom - 150);
    exitX = entry === 'left' ? rect.width + type.size : -type.size;
    const diagonal = (Math.random() < .5 ? -1 : 1) * (rect.height * (.22 + Math.random() * .22));
    exitY = Math.max(40, Math.min(routeBottom, y + diagonal));
  } else {
    x = 30 + Math.random() * Math.max(40, rect.width - 60); y = -type.size;
    exitX = Math.random() < .5 ? -type.size : rect.width + type.size;
    exitY = 92 + Math.random() * Math.max(30, routeBottom - 150);
  }
  const centerX = rect.width / 2; const centerY = rect.height * .43; const radius = Math.min(rect.width * .29, rect.height * .24);
  let viaX = centerX; let viaY = centerY;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const angle = Math.random() * Math.PI * 2; const r = radius * Math.sqrt(Math.random());
    const candidateX = centerX + Math.cos(angle) * r; const candidateY = centerY + Math.sin(angle) * r;
    const clear = state.targets.every((other) => {
      if (!other.alive || other.fleeing) return true;
      const otherX = other.waypoint && !other.waypoint.reached ? other.waypoint.x : other.x + other.size / 2;
      const otherY = other.waypoint && !other.waypoint.reached ? other.waypoint.y : other.y + other.size / 2;
      return Math.hypot(candidateX - otherX, candidateY - otherY) > type.size * 1.75;
    });
    viaX = candidateX; viaY = candidateY;
    if (clear) break;
  }
  const distance = Math.hypot(viaX - x, viaY - y) || 1;
  const vx = ((viaX - x) / distance) * speed;
  const vy = ((viaY - y) / distance) * speed;
  const visual = random(targetAssets); const el = document.createElement('div'); const targetImage = image(visual.src, 'target-asset');
  el.className = `target ${type.key}`; el.append(targetImage); el.style.setProperty('--size', `${type.size}px`); targetLayer.append(el);
  state.targets.push({ id: nextId++, type, el, image: targetImage, asset: visual.src, x, y, vx, vy, size: type.size, alive: true, waypoint: { x: viaX, y: viaY, exitX, exitY, reached: false }, behaviorAt: now + 430 + Math.random() * 640 });
}

function throwObject(event) {
  if (!state.active || state.paused || event.target.closest('button')) return;
  const rect = playfield.getBoundingClientRect(); const weapon = state.loadedWeapon;
  const endX = event.clientX - rect.left; const endY = event.clientY - rect.top; const startX = rect.width / 2; const startY = rect.height - 35;
  const el = document.createElement('div'); el.className = 'projectile'; el.append(image(weapon.asset)); projectileLayer.append(el);
  state.projectiles.push({ id: nextId++, el, weapon, startX, startY, endX, endY, startAt: performance.now(), duration: 438, alive: true });
  state.loadedWeapon = random(weapons); updateLoadedProjectile();
}

function spawnImpact(x, y) {
  const impact = document.createElement('div'); impact.className = 'impact';
  impact.style.left = `${x - 14}px`; impact.style.top = `${y - 14}px`; projectileLayer.append(impact);
  setTimeout(() => impact.remove(), 320);
}
function spawnHeartPair(x, y) {
  ['target-heart', 'projectile-heart'].forEach((kind) => {
    const heart = document.createElement('div'); heart.className = `heart-impact ${kind}`; heart.textContent = '♥';
    heart.style.left = `${x}px`; heart.style.top = `${y}px`; projectileLayer.append(heart);
    setTimeout(() => heart.remove(), 700);
  });
  const mini = document.createElement('div'); mini.className = 'heart-impact mini-heart'; mini.textContent = '♥';
  mini.style.left = `${x + 24}px`; mini.style.top = `${y - 28}px`; projectileLayer.append(mini);
  setTimeout(() => mini.remove(), 700);
}

function accelerateSpawnAfterHit(now) { state.spawnAt = Math.min(state.spawnAt, now + 120); }

function hitTarget(target, projectile, now) {
  if (!target.alive || target.invulnerable) return;
  const hitX = projectile.x ?? target.x + target.size / 2; const hitY = projectile.y ?? target.y + target.size / 2;
  target.alive = false; projectile.alive = false;
  if (target.type.key === 'trap') {
    target.alive = true; target.invulnerable = true;
    state.score = Math.max(0, state.score + target.type.points * scoreMultiplier(now));
    target.image.src = trapRunFrames[0];
    target.fleeing = { startedAt: now, fromX: target.x, fromY: target.y, toX: playfield.clientWidth + target.size * 2, toY: -target.size * 2, duration: 2570 };
    target.el.classList.add('fleeing'); target.el.style.zIndex = '0'; projectile.el.remove(); return;
  }
  if (projectile.weapon.hit === 'risan') {
    state.hits += 1; state.score += target.type.points * scoreMultiplier(now); accelerateSpawnAfterHit(now);
    spawnHeartPair(hitX, hitY); target.el.remove(); projectile.el.remove(); return;
  }
  projectile.el.remove();
  state.hits += 1;
  state.score += target.type.points * scoreMultiplier(now); accelerateSpawnAfterHit(now);
  if (projectile.weapon.hit === 'rock') spawnImpact(hitX, hitY);
  if (projectile.weapon.hit === 'manhole') { target.image.src = assets.manholeHitPerson; target.el.classList.add('manholed'); target.falling = true; target.vx = 0; target.vy = 200; setTimeout(() => target.el.remove(), 1800); }
  else if (projectile.weapon.hit === 'poo') { target.el.classList.add('pooed'); target.lingerUntil = now + 660; }
  else if (projectile.weapon.hit === 'pig') { target.image.src = assets.pigHitPork; target.el.classList.add('pigged'); target.lingerUntil = now + 360; }
  else { target.el.remove(); }
}

function tick(now) {
  if (!state.active || state.paused) return;
  const elapsed = gameTime(now); if (elapsed >= 90000) return finishGame();
  const baseSpawnGap = Math.max(575, 1095 - elapsed / 142.5); const spawnGap = baseSpawnGap / (isDoubleEvent(now) ? 1.6 : 1); if (now >= state.spawnAt) { spawnTarget(now); state.spawnAt = now + spawnGap; }
  const rect = playfield.getBoundingClientRect();
  state.targets = state.targets.filter((t) => {
    if (!t.alive && !t.falling && !t.fleeing && !t.lingerUntil) return false;
    if (t.fleeing) {
      const p = Math.min(1, (now - t.fleeing.startedAt) / t.fleeing.duration);
      t.image.src = trapRunFrames[Math.floor((now - t.fleeing.startedAt) / 150) % trapRunFrames.length];
      const ease = 1 - Math.pow(1 - p, 3);
      t.x = t.fleeing.fromX + (t.fleeing.toX - t.fleeing.fromX) * ease;
      t.y = t.fleeing.fromY + (t.fleeing.toY - t.fleeing.fromY) * ease;
      t.el.style.transform = `translate(${t.x}px, ${t.y}px)`;
      if (p === 1) { t.el.remove(); return false; }
      return true;
    }
    if (t.lingerUntil) {
      if (now >= t.lingerUntil) { t.el.remove(); return false; }
      t.el.style.transform = `translate(${t.x}px, ${t.y}px) scale(1.08)`; return true;
    }
    if (t.waypoint && !t.waypoint.reached) {
      const remain = Math.hypot(t.waypoint.x - t.x, t.waypoint.y - t.y);
      if (remain <= Math.max(4, Math.hypot(t.vx, t.vy) / 50)) {
        t.x = t.waypoint.x; t.y = t.waypoint.y; t.waypoint.reached = true;
        const outDistance = Math.hypot(t.waypoint.exitX - t.x, t.waypoint.exitY - t.y) || 1;
        const speed = Math.hypot(t.vx, t.vy);
        t.vx = ((t.waypoint.exitX - t.x) / outDistance) * speed; t.vy = ((t.waypoint.exitY - t.y) / outDistance) * speed;
      }
    }
    if (t.type.key === 'trickster' && t.alive && (!t.waypoint || t.waypoint.reached) && now >= t.behaviorAt) {
      const speed = Math.max(120, Math.hypot(t.vx, t.vy)) * 1.7;
      const turn = (Math.random() < .5 ? -1 : 1) * (Math.PI * (.32 + Math.random() * .42));
      const direction = Math.atan2(t.vy, t.vx) + turn;
      t.vx = Math.cos(direction) * speed; t.vy = Math.sin(direction) * speed; t.behaviorAt = now + 300 + Math.random() * 520;
    }
    let avoidX = 0; let avoidY = 0;
    state.targets.forEach((other) => {
      if (other === t || !other.alive || other.fleeing || other.falling || other.lingerUntil) return;
      const dx = (t.x + t.size / 2) - (other.x + other.size / 2);
      const dy = (t.y + t.size / 2) - (other.y + other.size / 2);
      const distance = Math.hypot(dx, dy) || 1;
      const personalSpace = (t.size + other.size) * (isDoubleEvent(now) ? .65 : .72);
      if (distance >= personalSpace) return;
      const push = Math.min(2.6, (1 - distance / personalSpace) * 2.6);
      avoidX += (dx / distance) * push;
      avoidY += (dy / distance) * push;
    });
    t.x += t.vx / 60 + avoidX; t.y += t.vy / 60 + avoidY;
    const wobbleX = Math.sin(now / 92 + t.id * 1.7) * 2.2; const wobbleY = Math.cos(now / 118 + t.id * 1.3) * 2.6;
    t.el.style.transform = `translate(${t.x + wobbleX}px, ${t.y + wobbleY}px) rotate(${t.type.key === 'trickster' ? Math.sin(now / 65) * 14 : Math.sin(now / 175 + t.id) * 2.5}deg)`;
    const gone = t.x < -t.size * 2 || t.x > rect.width + t.size * 2 || t.y < -t.size * 2 || t.y > rect.height + t.size * 2;
    if (gone) t.el.remove(); return !gone;
  });
  state.projectiles = state.projectiles.filter((p) => {
    if (!p.alive) return false; const progress = Math.min(1, (now - p.startAt) / p.duration);
    const x = p.startX + (p.endX - p.startX) * progress; const y = p.startY + (p.endY - p.startY) * progress; p.x = x; p.y = y; const scale = 1;
    p.el.style.transform = `translate(${x - 48}px, ${y - 48}px) scale(${scale}) rotate(${progress * 480}deg)`;
    if (progress >= .97 && p.alive) {
      const landedOn = state.targets.find((t) => t.alive && !t.invulnerable && projectileOverlapsTarget(t, x, y));
      if (landedOn) hitTarget(landedOn, p, now);
    }
    if (progress >= 1 && p.alive) {
      if (p.alive) { p.el.remove(); p.alive = false; }
    }
    return p.alive;
  });
  updateHud(now); state.raf = requestAnimationFrame(tick);
}

function finishGame() { state.active = false; cancelAnimationFrame(state.raf); targetLayer.replaceChildren(); projectileLayer.replaceChildren(); saveScore(state.score); $('#final-score').textContent = state.score; $('#hit-count').textContent = state.hits; showScreen('result'); }
const RANKING_API = 'https://script.google.com/macros/s/AKfycbxGTeWf9_IKHCCghNkgwBlG36h2s5MdDtHIezJEZ-SGTKAia9IauXz551m6-kQwhhKe/exec';
const RANKING_STORAGE_VERSION = 'shared-v1';
if (localStorage.getItem('hit-ris-ranking-version') !== RANKING_STORAGE_VERSION) {
  localStorage.removeItem('hit-ris-ranking');
  localStorage.setItem('hit-ris-ranking-version', RANKING_STORAGE_VERSION);
}
function rankings() { return JSON.parse(localStorage.getItem('hit-ris-ranking') || '[]'); }
function playerNickname() { return localStorage.getItem('hit-ris-nickname') || '익명'; }
function saveNickname() { const value = $('#nickname-input').value.trim().replace(/\s+/g, ' ').slice(0, 12); if (value) localStorage.setItem('hit-ris-nickname', value); $('#nickname-input').value = playerNickname(); }
function normalizeRankings(data) {
  const list = Array.isArray(data) ? data : (data.rankings || data.records || data.data || []);
  return list.map((record) => ({ nickname: String(record.nickname || record.name || '익명').slice(0, 12), date: String(record.date || ''), score: Number(record.score) || 0 }))
    .sort((a, b) => b.score - a.score).slice(0, 10);
}
function renderRankings(list) {
  const target = $('#ranking-list'); target.replaceChildren();
  if (!list.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = '아직 기록이 없습니다.'; target.append(empty); return; }
  list.forEach((record) => { const item = document.createElement('li'); const name = document.createElement('strong'); name.textContent = record.nickname || '익명'; const date = document.createElement('small'); date.textContent = record.date; const score = document.createElement('b'); score.textContent = record.score.toLocaleString() + '점'; item.append(name, date, score); target.append(item); });
}
async function fetchSharedRankings() {
  const response = await fetch(RANKING_API, { cache: 'no-store' });
  if (!response.ok) throw new Error('ranking fetch failed');
  return normalizeRankings(await response.json());
}
function saveScore(score) {
  const record = { nickname: playerNickname(), score, date: new Date().toLocaleDateString('ko-KR') };
  const list = [...rankings(), record].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem('hit-ris-ranking', JSON.stringify(list));
  fetch(RANKING_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(record) }).catch(() => {});
}
async function showRanking() {
  showScreen('ranking'); renderRankings(rankings().slice(0, 10));
  try { renderRankings(await fetchSharedRankings()); } catch (_) { /* offline fallback: local ranking stays visible */ }
}
function togglePause() { if (!state.active) return; state.paused = true; state.pauseStartedAt = performance.now(); cancelAnimationFrame(state.raf); pauseModal.classList.add('open'); pauseModal.setAttribute('aria-hidden', 'false'); }
function resumeGame() { if (!state.paused) return; state.pausedTotal += performance.now() - state.pauseStartedAt; state.paused = false; pauseModal.classList.remove('open'); pauseModal.setAttribute('aria-hidden', 'true'); state.raf = requestAnimationFrame(tick); }

$('#start-button').addEventListener('click', resetGame); $('#retry-button').addEventListener('click', resetGame); $('#pause-button').addEventListener('click', togglePause); $('#resume-button').addEventListener('click', resumeGame); $('#restart-button').addEventListener('click', resetGame); $('#exit-button').addEventListener('click', () => { state.active = false; pauseModal.classList.remove('open'); showScreen('home'); }); $('#ranking-button').addEventListener('click', showRanking); $('#result-ranking-button').addEventListener('click', showRanking); $('#ranking-home-button').addEventListener('click', () => showScreen('home')); $('#result-home-button').addEventListener('click', () => showScreen('home')); $('#about-button').addEventListener('click', () => showScreen('about')); $('#about-home-button').addEventListener('click', () => showScreen('home')); playfield.addEventListener('pointerdown', throwObject);
$('#nickname-save-button').addEventListener('click', saveNickname); $('#nickname-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') saveNickname(); }); $('#nickname-input').value = playerNickname();
document.querySelectorAll('[data-home-asset]').forEach((node) => node.append(image(assets[node.dataset.homeAsset])));
const gameAmbient = document.querySelector('#game-screen .ambient-text-layer');
gameAmbient.querySelectorAll('.marquee-row div').forEach((line) => {
  const text = line.textContent.trim();
  line.textContent = Array.from({ length: 5 }, () => text).join('　');
});
gameAmbient.innerHTML += gameAmbient.innerHTML;
const ambientMarkup = gameAmbient.innerHTML;
document.querySelectorAll('.shared-ambient').forEach((node) => { node.innerHTML = ambientMarkup; });
document.querySelectorAll('.marquee-row').forEach((row) => {
  const rightward = Math.random() < .48;
  row.classList.toggle('right', rightward); row.classList.toggle('left', !rightward);
  row.style.setProperty('--speed', `${(5.2 + Math.random() * 7.6).toFixed(2)}s`);
  row.style.transform = `rotate(${(Math.random() * 5 - 2.5).toFixed(2)}deg) scale(${(1.1 + Math.random() * .12).toFixed(2)})`;
});
