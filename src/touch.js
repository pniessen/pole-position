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
    <div class="drive" id="tz-left">&#9664;</div>
    <div class="drive" id="tz-right">&#9654;</div>
    <div class="drive" id="tz-brake">BRAKE</div>
    <div class="drive gearcol">
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
  hold($('#tz-left'), () => { state.steer = -1; }, () => { if (state.steer === -1) state.steer = 0; });
  hold($('#tz-right'), () => { state.steer = 1; }, () => { if (state.steer === 1) state.steer = 0; });
  hold($('#tz-brake'), () => { state.brake = 1; }, () => { state.brake = 0; });

  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
  tap($('#tz-gup'), () => onGearDelta(1));
  tap($('#tz-gdown'), () => onGearDelta(-1));

  // --- menu tap targets (attached to the HUD screens already in the DOM) ---
  const attract = document.querySelector('#attract');
  attract?.addEventListener('pointerdown', () => pressKey('Enter'));

  const select = document.querySelector('#select');
  select?.addEventListener('pointerdown', (e) => {
    const frac = e.clientX / innerWidth;
    if (frac < 0.3) pressKey('ArrowLeft');
    else if (frac > 0.7) pressKey('ArrowRight');
    else pressKey('Enter');
  });

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
