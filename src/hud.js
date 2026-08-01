import './hud.css';
import { RACE } from './race.js';

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  if (html) node.innerHTML = html;
  return node;
}

export function createHud() {
  const root = el('div', { id: 'hud' });
  root.innerHTML = `
    <div class="topbar">
      <div><span class="label">Score</span><span id="score">000000</span></div>
      <div><span class="label">Time</span><span id="time">75</span></div>
      <div><span class="label">Lap</span><span id="lap">1/${RACE.totalLaps}</span></div>
      <div><span class="label">Gear</span><span id="gear">1</span></div>
      <div><span class="label">Speed</span><span id="speed">0</span> km/h</div>
    </div>
    <div class="center hidden" id="countdown"></div>
    <canvas id="minimap" width="180" height="180"></canvas>
    <div class="banner hidden" id="banner"></div>
    <div id="crashflash"></div>
    <div class="screen" id="attract">
      <h1>POLE POSITION</h1>
      <h2>First-person arcade racer</h2>
      <div id="attract-scores"></div>
      <h2 class="blink">Press any key</h2>
    </div>
    <div class="screen hidden" id="select">
      <h2 id="select-title" class="select-title"></h2>
      <div class="select-card">
        <img id="select-image" alt="" />
        <h1 id="select-name" class="select-name">&#9664; <span id="select-name-text"></span> &#9654;</h1>
        <div id="select-desc"></div>
        <div id="select-stats"></div>
      </div>
      <h2 class="blink" id="select-prompt">&#9664; &#9654; browse &middot; Enter confirm &middot; Esc back</h2>
      <div class="navbtn prev" id="sel-prev">&#9664;</div>
      <div class="navbtn next" id="sel-next">&#9654;</div>
      <div class="selbtns">
        <h2 class="tapbtn" id="sel-back">&#8617; BACK</h2>
        <h2 class="tapbtn confirm" id="sel-confirm">SELECT &#10003;</h2>
      </div>
    </div>
    <div class="screen hidden" id="initials">
      <h2>High score! Enter your initials</h2>
      <div class="entry" id="entry">___</div>
      <h2>A-Z, Backspace, Enter to confirm</h2>
    </div>
    <div class="screen hidden" id="gameover">
      <h1 id="gameover-title">GAME OVER</h1>
      <h2 id="final-score"></h2>
      <div id="gameover-scores"></div>
      <h2 class="blink">Enter: race again &middot; Esc: choose track</h2>
    </div>
  `;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  return {
    root,
    score: $('score'), time: $('time'), lap: $('lap'), speed: $('speed'), gear: $('gear'),
    countdown: $('countdown'), banner: $('banner'), crashflash: $('crashflash'),
    attract: $('attract'), attractScores: $('attract-scores'),
    select: $('select'), selectTitle: $('select-title'), selectImage: $('select-image'),
    selectName: $('select-name-text'), selectDesc: $('select-desc'), selectStats: $('select-stats'),
    initials: $('initials'), entry: $('entry'),
    gameover: $('gameover'), gameoverTitle: $('gameover-title'),
    finalScore: $('final-score'), gameoverScores: $('gameover-scores'),
    minimap: $('minimap'),
    bannerTimer: 0, wasCrashed: false,
    mapPoints: null, mapTransform: null,
  };
}

// --- minimap ---

const MAP_PAD = 14;

export function setMinimapTrack(hud, points) {
  // points: [{x, z}] sampled uniformly along the track, in world space
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const w = hud.minimap.width - MAP_PAD * 2, h = hud.minimap.height - MAP_PAD * 2;
  const scale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
  const ox = MAP_PAD + (w - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = MAP_PAD + (h - (maxZ - minZ) * scale) / 2 - minZ * scale;
  hud.mapPoints = points;
  hud.mapTransform = (p) => [p.x * scale + ox, p.z * scale + oz];
}

export function updateMinimap(hud, player, rivals) {
  if (!hud.mapPoints) return;
  const ctx = hud.minimap.getContext('2d');
  const t = hud.mapTransform;
  ctx.clearRect(0, 0, hud.minimap.width, hud.minimap.height);
  // track outline
  ctx.beginPath();
  const [x0, y0] = t(hud.mapPoints[0]);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < hud.mapPoints.length; i++) ctx.lineTo(...t(hud.mapPoints[i]));
  ctx.closePath();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(240,240,240,0.85)';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // start line + checkpoint markers
  const dot = (p, r, fill) => {
    const [x, y] = t(p);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  dot(hud.mapPoints[0], 3.5, '#111');
  dot(hud.mapPoints[Math.floor(hud.mapPoints.length / 2)], 3.5, '#ffd21f');
  // rivals then player on top
  for (const r of rivals) dot(r, 3, '#ff5533');
  dot(player, 4.5, '#fff');
  const [px, py] = t(player);
  ctx.beginPath();
  ctx.arc(px, py, 4.5, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#111';
  ctx.stroke();
}

function scoreTable(scores) {
  if (!scores.length) return '';
  const rows = scores.map((e, i) =>
    `<tr class="${i === 0 ? 'top' : ''}"><td class="rank">${i + 1}</td><td>${e.initials}</td><td>${String(e.score).padStart(6, '0')}</td></tr>`
  ).join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

export function updateHud(hud, race, car, dt) {
  hud.score.textContent = String(Math.round(race.score)).padStart(6, '0');
  const t = Math.ceil(race.timeLeft);
  hud.time.textContent = String(t);
  hud.time.classList.toggle('low', race.phase === 'racing' && t <= 10);
  hud.lap.textContent = `${race.lap}/${RACE.totalLaps}`;
  hud.speed.textContent = String(Math.round(car.speed * 3.6));
  hud.gear.textContent = String(car.gear ?? 1);

  if (race.phase === 'countdown') {
    hud.countdown.classList.remove('hidden');
    hud.countdown.textContent = String(Math.ceil(race.countdown));
  } else if (race.phase === 'racing' && race.countdown === 0 && race.timeLeft > RACE.startTime - 1) {
    hud.countdown.classList.remove('hidden');
    hud.countdown.textContent = 'GO!';
  } else {
    hud.countdown.classList.add('hidden');
  }

  if (race.justCheckpoint || race.justLap) {
    hud.banner.textContent = race.justLap ? `LAP ${race.lap} — EXTENDED TIME!` : 'EXTENDED TIME!';
    hud.bannerTimer = 1.5;
  }
  hud.bannerTimer = Math.max(0, hud.bannerTimer - dt);
  hud.banner.classList.toggle('hidden', hud.bannerTimer <= 0);

  // crash flash on the transition into a crash
  const crashed = car.crashTimer > 0;
  hud.crashflash.style.opacity = crashed && !hud.wasCrashed ? '0.55' : '0';
  hud.wasCrashed = crashed;
}

export function showAttract(hud, scores) {
  hideScreens(hud);
  hud.attract.classList.remove('hidden');
  hud.attractScores.innerHTML = scoreTable(scores);
}

// Generic picker screen used for both the car showroom and track select.
// entry: { title, image, name, desc, stats: [{label, frac?, value?}] }
export function showSelect(hud, entry) {
  hideScreens(hud);
  hud.select.classList.remove('hidden');
  hud.selectTitle.textContent = entry.title;
  hud.selectImage.src = entry.image;
  hud.selectName.textContent = entry.name;
  hud.selectDesc.textContent = entry.desc;
  hud.selectStats.innerHTML = entry.stats.map((s) => {
    const value = s.value ? `<span class="stat-value">${s.value}</span>` : '';
    const bar = s.frac !== undefined
      ? `<span class="stat-bar"><span class="stat-fill" style="width:${Math.round(Math.min(1, s.frac) * 100)}%"></span></span>`
      : '';
    return `<div class="stat-row"><span class="stat-label">${s.label}</span>${bar}${value}</div>`;
  }).join('');
}

export function hideScreens(hud) {
  hud.attract.classList.add('hidden');
  hud.select.classList.add('hidden');
  hud.gameover.classList.add('hidden');
  hud.initials.classList.add('hidden');
}

export function showGameOver(hud, race, scores) {
  hideScreens(hud);
  hud.gameover.classList.remove('hidden');
  hud.gameoverTitle.textContent = race.phase === 'finished' ? 'RACE COMPLETE!' : 'GAME OVER';
  hud.finalScore.textContent = `Score: ${String(Math.round(race.score)).padStart(6, '0')}`;
  hud.gameoverScores.innerHTML = scoreTable(scores);
}

export function showInitialsEntry(hud, onDone) {
  hideScreens(hud);
  hud.initials.classList.remove('hidden');
  let letters = '';
  const render = () => {
    hud.entry.textContent = (letters + '___').slice(0, 3);
  };
  render();
  const handler = (e) => {
    e.stopPropagation();
    if (/^Key[A-Z]$/.test(e.code) && letters.length < 3) {
      letters += e.code.slice(3);
    } else if (e.code === 'Backspace') {
      letters = letters.slice(0, -1);
    } else if (e.code === 'Enter' && letters.length === 3) {
      removeEventListener('keydown', handler, true);
      onDone(letters);
      return;
    }
    render();
  };
  addEventListener('keydown', handler, true);
  return handler;
}
