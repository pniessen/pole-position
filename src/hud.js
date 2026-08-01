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
      <div><span class="label">Speed</span><span id="speed">0</span> km/h</div>
    </div>
    <div class="center hidden" id="countdown"></div>
    <div class="banner hidden" id="banner"></div>
    <div id="crashflash"></div>
    <div class="screen" id="attract">
      <h1>POLE POSITION</h1>
      <h2>First-person arcade racer</h2>
      <div id="attract-scores"></div>
      <h2 class="blink">Press any key to race</h2>
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
      <h2 class="blink">Press Enter to race again</h2>
    </div>
  `;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  return {
    root,
    score: $('score'), time: $('time'), lap: $('lap'), speed: $('speed'),
    countdown: $('countdown'), banner: $('banner'), crashflash: $('crashflash'),
    attract: $('attract'), attractScores: $('attract-scores'),
    initials: $('initials'), entry: $('entry'),
    gameover: $('gameover'), gameoverTitle: $('gameover-title'),
    finalScore: $('final-score'), gameoverScores: $('gameover-scores'),
    bannerTimer: 0, wasCrashed: false,
  };
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
  hud.attract.classList.remove('hidden');
  hud.attractScores.innerHTML = scoreTable(scores);
  hud.gameover.classList.add('hidden');
  hud.initials.classList.add('hidden');
}

export function hideScreens(hud) {
  hud.attract.classList.add('hidden');
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
