// 輸入層：鍵盤、滑鼠/觸控拖曳、滾輪、虛擬搖桿。只寫入 S 的視角欄位（yaw/pitch/byaw/birdH/dist）與 keys/joy。
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = (s) => document.querySelector(s);
const KM = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'tl', ArrowLeft: 'tl', KeyD: 'tr', ArrowRight: 'tr', KeyQ: 'sl', KeyE: 'sr', ShiftLeft: 'run', ShiftRight: 'run' };

// on: { cycleMode(), cancel(), pick(pointerEvent) }
export function createInput(canvas, S, on) {
  const keys = {}, joy = { x: 0, y: 0 }; let drag = null, lastDragT = -9;
  addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const k = KM[e.code]; if (k) { keys[k] = true; e.preventDefault(); }
    if (e.code === 'KeyV') on.cycleMode(); if (e.code === 'Escape') on.cancel(); });
  addEventListener('keyup', e => { const k = KM[e.code]; if (k) keys[k] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  canvas.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx_ = e.clientX - drag.x, dy_ = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true;
    if (S.mode === 'bird') S.byaw -= dx_ * 0.0055; else S.yaw -= dx_ * 0.0055 * S.turnK; if (S.mode !== 'bird') S.pitch = clamp(S.pitch + dy_ * 0.004 * S.turnK, -0.45, 1.25); lastDragT = performance.now(); });
  canvas.addEventListener('pointerup', e => { if (drag && !drag.moved && S.mode === 'bird') on.pick(e); drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (S.mode === 'bird') S.birdH = clamp(S.birdH + e.deltaY * 0.08, 20, 180); else S.dist = clamp(S.dist + e.deltaY * 0.008, 2.5, 14); }, { passive: false });
  (function joystick() { const el = $('#joy'), knob = $('#joyknob'); let id = null;
    const set = (e) => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
      let dx_ = (e.clientX - cx) / R, dy_ = (e.clientY - cy) / R; const l = Math.hypot(dx_, dy_); if (l > 1) { dx_ /= l; dy_ /= l; }
      joy.x = dx_; joy.y = -dy_; knob.style.transform = `translate(${dx_ * R * .55}px,${dy_ * R * .55}px)`; };
    el.addEventListener('pointerdown', e => { id = e.pointerId; el.setPointerCapture(id); set(e); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
    const end = e => { if (e.pointerId === id) { id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); })();

  return {
    keys, joy,
    // 使用者最近是否在拖曳視角（導覽中自動轉鏡頭要讓位）
    recentlyDragged: (ms = 900) => !!drag || performance.now() - lastDragT <= ms,
    // 目前的移動軸：fwd 前後、turn 轉彎、str 橫移
    axes() { return {
      fwd: (keys.f ? 1 : 0) - (keys.b ? 1 : 0) + joy.y,
      turn: (keys.tl ? 1 : 0) - (keys.tr ? 1 : 0) - joy.x * 0.9,
      str: (keys.sr ? 1 : 0) - (keys.sl ? 1 : 0) }; },
  };
}
