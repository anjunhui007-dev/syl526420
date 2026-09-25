const $ = (selector) => document.querySelector(selector);

const screens = { home: $('#home-screen'), game: $('#game-screen'), result: $('#result-screen'), ranking: $('#ranking-screen') };
const playfield = $('#playfield');
const targetLayer = $('#target-layer');
const projectileLayer = $('#projectile-layer');
const pauseModal = $('#pause-modal');
const assets = window.HIT_ASSETS;
const weapons = [
  { name: '돼지', asset: assets.projectilePig, hit: 'pig' },
  { name: '똥', asset: assets.projectilePoo, hit: 'poo' },
  { name: '맨홀뚜껑', asset: assets.projectileManhole, hit: 'manhole' },
  { name: '돌', asset: assets.projectileRock, hit: 'rock' },
  { name: '리산성', asset: assets.projectileRisangseong, hit: 'risan' },
];
const targetTypes = [
  { key: 'normal', size: 86, points: 10, weight: 48 },
  { key: 'small', size: 86, points: 30, weight: 22 },
  { key: 'big', size: 86, points: 5, weight: 15 },
  { key: 'trap', size: 86, points: -50, weight: 6 },
  { key: 'trickster', size: 86, points: 70, weight: 9 },
];
const targetAssets = [
  { src: assets.targetNew0 }, { src: assets.targetNew1 }, { src: assets.targetNew2 }, { src: assets.targetNew3 },
  { src: assets.targetNew4 }, { src: assets.targetNew5 }, { src: assets.targetNew6 }, { src: assets.targetNew7 },
];
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
function weightedTarget() {
  const total = targetTypes.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  return targetTypes.find((item) => (roll -= item.weight) <= 0) || targetTypes[0];
}
function formatTime(milliseconds) { const sec = Math.max(0, Math.ceil(milliseconds / 1000)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
function gameTime(now) { return now - state.startedAt - state.pausedTotal; }
function updateHud(now) { $('#score-value').textContent = state.score; $('#timer-value').textContent = formatTime(90000 - gameTime(now)); }

function resetGame() {
  cancelAnimationFrame(state.raf); targetLayer.replaceChildren(); projectileLayer.replaceChildren();
  Object.assign(state, { active: true, paused: false, startedAt: performance.now(), pauseStartedAt: 0, pausedTotal: 0, score: 0, hits: 0, targets: [], projectiles: [], spawnAt: 0, loadedWeapon: random(weapons) });
  pauseModal.classList.remove('open'); pauseModal.setAttribute('aria-hidden', 'true');
  updateLoadedProjectile(); showScreen('game'); state.raf = requestAnimationFrame(tick);
}

function spawnTarget(now) {
  const type = weightedTarget(); const rect = playfield.getBoundingClientRect(); const edgeRoll = Math.random();
  const entry = edgeRoll < .72 ? (Math.random() < .5 ? 'left' : 'right') : 'top';
  const rareLowerRoute = Math.random() < .05; const routeBottom = rareLowerRoute ? rect.height - 145 : Math.max(165, rect.height * .58);
  let x, y, exitX, exitY;
  const speed = (36 + Math.random() * 30 + Math.min(gameTime(now) / 1500, 30)) * (type.key === 'small' ? 1.28 : 1);
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
  const distance = Math.hypot(exitX - x, exitY - y) || 1;
  const vx = ((exitX - x) / distance) * speed;
  const vy = ((exitY - y) / distance) * speed;
  const visual = random(targetAssets); const el = document.createElement('div'); const targetImage = image(visual.src, 'target-asset');
  el.className = `target ${type.key}`; el.append(targetImage); el.style.setProperty('--size', `${type.size}px`); targetLayer.append(el);
  state.targets.push({ id: nextId++, type, el, image: targetImage, asset: visual.src, x, y, vx, vy, size: type.size, alive: true, behaviorAt: now + 430 + Math.random() * 640 });
}

function throwObject(event) {
  if (!state.active || state.paused || event.target.closest('button')) return;
  const rect = playfield.getBoundingClientRect(); const weapon = state.loadedWeapon;
  const endX = event.clientX - rect.left; const endY = event.clientY - rect.top; const startX = rect.width / 2; const startY = rect.height - 35;
  const el = document.createElement('div'); el.className = 'projectile'; el.append(image(weapon.asset)); projectileLayer.append(el);
  state.projectiles.push({ id: nextId++, el, weapon, startX, startY, endX, endY, startAt: performance.now(), duration: 570, alive: true });
  state.loadedWeapon = random(weapons); updateLoadedProjectile();
}

function hitTarget(target, projectile, now) {
  if (!target.alive || target.invulnerable) return; target.alive = false; projectile.alive = false; projectile.el.remove();
  if (target.type.key === 'trap') {
    target.alive = true; target.invulnerable = true;
    state.score = Math.max(0, state.score + target.type.points);
    target.fleeing = { startedAt: now, fromX: target.x, fromY: target.y, toX: playfield.clientWidth + target.size * 2, toY: -target.size * 2, duration: 520 };
    target.el.classList.add('fleeing'); return;
  }
  state.hits += 1;
  state.score += target.type.points;
  const impact = document.createElement('div'); impact.className = 'impact'; impact.style.left = `${target.x}px`; impact.style.top = `${target.y}px`; projectileLayer.append(impact); setTimeout(() => impact.remove(), 320);
  if (projectile.weapon.hit === 'manhole') { target.image.src = assets.targetManhole; target.el.classList.add('manholed'); target.falling = true; target.vx = 0; target.vy = 650; setTimeout(() => target.el.remove(), 650); }
  else if (projectile.weapon.hit === 'poo') { target.el.classList.add('pooed'); target.lingerUntil = now + 330; }
  else if (projectile.weapon.hit === 'pig') { target.image.src = assets.targetHitPig; target.el.classList.add('pigged'); target.lingerUntil = now + 360; }
  else { target.el.remove(); }
}

function tick(now) {
  if (!state.active || state.paused) return;
  const elapsed = gameTime(now); if (elapsed >= 90000) return finishGame();
  const spawnGap = Math.max(430, 820 - elapsed / 190); if (now >= state.spawnAt) { spawnTarget(now); state.spawnAt = now + spawnGap; }
  const rect = playfield.getBoundingClientRect();
  state.targets = state.targets.filter((t) => {
    if (!t.alive && !t.falling && !t.fleeing && !t.lingerUntil) return false;
    if (t.fleeing) {
      const p = Math.min(1, (now - t.fleeing.startedAt) / t.fleeing.duration);
      const ease = 1 - Math.pow(1 - p, 3);
      t.x = t.fleeing.fromX + (t.fleeing.toX - t.fleeing.fromX) * ease;
      t.y = t.fleeing.fromY + (t.fleeing.toY - t.fleeing.fromY) * ease;
      t.el.style.transform = `translate(${t.x}px, ${t.y}px) rotate(${p * 400}deg)`;
      if (p === 1) { t.el.remove(); return false; }
      return true;
    }
    if (t.lingerUntil) {
      if (now >= t.lingerUntil) { t.el.remove(); return false; }
      t.el.style.transform = `translate(${t.x}px, ${t.y}px) scale(1.08)`; return true;
    }
    if (t.type.key === 'trickster' && t.alive && now >= t.behaviorAt) { t.vx = (Math.random() * 2 - 1) * 190; t.vy = (Math.random() * 2 - 1) * 170; t.behaviorAt = now + 180 + Math.random() * 340; }
    t.x += t.vx / 60; t.y += t.vy / 60; t.el.style.transform = `translate(${t.x}px, ${t.y}px) rotate(${t.type.key === 'trickster' ? Math.sin(now / 65) * 14 : 0}deg)`;
    const gone = t.x < -t.size * 2 || t.x > rect.width + t.size * 2 || t.y < -t.size * 2 || t.y > rect.height + t.size * 2;
    if (gone) t.el.remove(); return !gone;
  });
  state.projectiles = state.projectiles.filter((p) => {
    if (!p.alive) return false; const progress = Math.min(1, (now - p.startAt) / p.duration);
    const x = p.startX + (p.endX - p.startX) * progress; const y = p.startY + (p.endY - p.startY) * progress; const scale = 1;
    p.el.style.transform = `translate(${x - 48}px, ${y - 48}px) scale(${scale}) rotate(${progress * 480}deg)`;
    if (progress >= .86 && p.alive) {
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
function rankings() { return JSON.parse(localStorage.getItem('hit-ris-ranking') || '[]'); }
function saveScore(score) { const list = [...rankings(), { score, date: new Date().toLocaleDateString('ko-KR') }].sort((a, b) => b.score - a.score).slice(0, 10); localStorage.setItem('hit-ris-ranking', JSON.stringify(list)); }
function showRanking() { const list = rankings(); const target = $('#ranking-list'); target.replaceChildren(); if (!list.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = '아직 기록이 없습니다.'; target.append(empty); } else list.forEach((record) => { const item = document.createElement('li'); item.textContent = `${record.score.toLocaleString()}점`; const small = document.createElement('small'); small.textContent = `  ·  ${record.date}`; item.append(small); target.append(item); }); showScreen('ranking'); }
function togglePause() { if (!state.active) return; state.paused = true; state.pauseStartedAt = performance.now(); cancelAnimationFrame(state.raf); pauseModal.classList.add('open'); pauseModal.setAttribute('aria-hidden', 'false'); }
function resumeGame() { if (!state.paused) return; state.pausedTotal += performance.now() - state.pauseStartedAt; state.paused = false; pauseModal.classList.remove('open'); pauseModal.setAttribute('aria-hidden', 'true'); state.raf = requestAnimationFrame(tick); }

$('#start-button').addEventListener('click', resetGame); $('#retry-button').addEventListener('click', resetGame); $('#pause-button').addEventListener('click', togglePause); $('#resume-button').addEventListener('click', resumeGame); $('#restart-button').addEventListener('click', resetGame); $('#exit-button').addEventListener('click', () => { state.active = false; pauseModal.classList.remove('open'); showScreen('home'); }); $('#ranking-button').addEventListener('click', showRanking); $('#result-ranking-button').addEventListener('click', showRanking); $('#ranking-home-button').addEventListener('click', () => showScreen('home')); $('#result-home-button').addEventListener('click', () => showScreen('home')); playfield.addEventListener('pointerdown', throwObject);
document.querySelectorAll('[data-home-asset]').forEach((node) => node.append(image(assets[node.dataset.homeAsset])));
const ambientMarkup = document.querySelector('#game-screen .ambient-text-layer').innerHTML;
document.querySelectorAll('.shared-ambient').forEach((node) => { node.innerHTML = ambientMarkup; });
