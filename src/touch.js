// Touch controls: auto-throttle driving with steer pads, brake pedal, and
// gear buttons, plus tap targets for every menu screen. All menu taps are
// translated into synthetic keydown events so the existing keyboard flow
// (including the initials entry) handles them unchanged.

export function isTouchDevice() {
  return 'ontouchstart' in window
    || (navigator.maxTouchPoints ?? 0) > 0
    || new URLSearchParams(location.search).has('touch'); // testing hook
}

function pressKey(code) {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}

export function initTouch({ onGearDelta }) {
  const state = { active: isTouchDevice(), steer: 0, brake: 0 };
  if (!state.active) return state;
  document.body.classList.add('touch');

  const ui = document.createElement('div');
  ui.id = 'touch-ui';
  ui.innerHTML = `
    <div id="rotate-hint"><div>&#8635;</div><span>ROTATE FOR LANDSCAPE</span></div>
    <div class="drive" id="tz-steer">
      <div id="steer-notch"></div>
      <div id="steer-knob">&#9664;&#9654;</div>
    </div>
    <div class="drive" id="tz-brake">BRAKE</div>
    <div class="drive" id="tz-exit">&#10005;</div>
    <div class="drive gearcol">
      <div id="shift-hint"></div>
      <div class="gbtn" id="tz-gup">&#9650;<small>GEAR</small></div>
      <div class="gbtn" id="tz-gdown">&#9660;</div>
    </div>
  `;
  document.body.appendChild(ui);
  const $ = (id) => ui.querySelector(id);

  // held controls track their own pointers so multi-touch works
  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      el.classList.add('held');
      on();
    });
    const end = (e) => {
      e.stopPropagation();
      el.classList.remove('held');
      off();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  hold($('#tz-brake'), () => { state.brake = 1; }, () => { state.brake = 0; });

  // analog steering bar: thumb offset from center = steering strength
  const steerBar = $('#tz-steer');
  const knob = $('#steer-knob');
  const setSteer = (clientX) => {
    const r = steerBar.getBoundingClientRect();
    let v = ((clientX - r.left) / r.width) * 2 - 1;
    v = Math.max(-1, Math.min(1, v));
    if (Math.abs(v) < 0.1) v = 0; // center deadzone
    state.steer = v;
    knob.style.left = `${((v + 1) / 2) * 100}%`;
  };
  steerBar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { steerBar.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    steerBar.classList.add('held');
    setSteer(e.clientX);
  });
  steerBar.addEventListener('pointermove', (e) => {
    if (steerBar.classList.contains('held')) setSteer(e.clientX);
  });
  const endSteer = (e) => {
    e.stopPropagation();
    steerBar.classList.remove('held');
    state.steer = 0;
    knob.style.left = '50%';
  };
  steerBar.addEventListener('pointerup', endSteer);
  steerBar.addEventListener('pointercancel', endSteer);

  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
  tap($('#tz-gup'), () => onGearDelta(1));
  tap($('#tz-gdown'), () => onGearDelta(-1));
  tap($('#tz-exit'), () => pressKey('Escape'));

  // shift-advice prompt: highlights the right gear button and shows a label
  const hintEl = $('#shift-hint');
  const gup = $('#tz-gup'), gdown = $('#tz-gdown');
  let currentHint = null;
  state.setHint = (dir) => {
    if (dir === currentHint) return;
    currentHint = dir;
    hintEl.textContent = dir === 'up' ? 'SHIFT ▲' : dir === 'down' ? 'SHIFT ▼' : '';
    hintEl.classList.toggle('on', !!dir);
    gup.classList.toggle('suggest', dir === 'up');
    gdown.classList.toggle('suggest', dir === 'down');
  };

  // --- menu tap targets (attached to the HUD screens already in the DOM) ---
  const attract = document.querySelector('#attract');
  attract?.addEventListener('pointerdown', () => pressKey('Enter'));

  // select screens browse/confirm only via explicit buttons — tapping the
  // card itself must never choose anything
  const selKey = (sel, code) => document.querySelector(sel)?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    pressKey(code);
  });
  selKey('#sel-prev', 'ArrowLeft');
  selKey('#sel-next', 'ArrowRight');
  selKey('#sel-confirm', 'Enter');
  selKey('#sel-back', 'Escape');
  const prompt = document.querySelector('#select-prompt');
  if (prompt) prompt.innerHTML = '&#9664; &#9654; browse &middot; SELECT to confirm';

  const gameover = document.querySelector('#gameover');
  if (gameover) {
    const setupBtn = document.createElement('h2');
    setupBtn.className = 'tapbtn';
    setupBtn.textContent = 'Tap here to change car / track';
    gameover.appendChild(setupBtn);
    setupBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); pressKey('Escape'); });
    gameover.addEventListener('pointerdown', () => pressKey('Enter'));
  }

  // --- tap keyboard for the initials entry ---
  const initials = document.querySelector('#initials');
  if (initials) {
    const kb = document.createElement('div');
    kb.id = 'tap-kb';
    const keys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `<span data-code="Key${l}">${l}</span>`);
    keys.push('<span data-code="Backspace">&#9003;</span>', '<span data-code="Enter" class="ok">OK</span>');
    kb.innerHTML = keys.join('');
    initials.appendChild(kb);
    kb.addEventListener('pointerdown', (e) => {
      const code = e.target.dataset?.code;
      if (code) pressKey(code);
    });
  }

  return state;
}
