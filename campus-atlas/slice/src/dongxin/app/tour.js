// 任務式導覽與互動提示（第三輪 E）。
//   任務：依序抵達 data/tour.dongxin.json 的站點（3–5 站）；頂部進度條；抵達（同樓層、距站點 ≤ radius）就跳出簡短介紹卡，按「下一站」繼續。
//         介紹文字只用已查證資料（棟名用途＝使用者確認、外觀＝使用者照片），每張卡附來源。非任務時，自動導覽抵達有介紹的地點也會跳卡。
//   互動：靠近教室門（門外 1.8 m 內）或樓梯口（梯間外框 1.2 m 內）時顯示「E」提示；按 E（或點提示）＝查看該教室／到上一層（頂樓則下一層）。
//         只有提示出現時 E 才是互動，其他時候 E 仍是橫移（input.js）。
const $ = (s) => document.querySelector(s);

export function createTour({ S, m, world, TARGETS, guide, ui, data }) {
  const { LY, STAIRS, levelLabel } = m;
  const byName = (n) => TARGETS.find(t => t.name === n);
  const stops = data.stops.map(byName).filter(Boolean), R = data.radius || 4.5;
  const curF = () => world.floorOfY(S.y + 0.1);
  let active = false, idx = 0, card = false;

  function render() {
    const el = $('#tour'); el.hidden = !active; if (!active) return;
    const n = stops.length, k = Math.min(idx, n);
    $('#tourfill').style.width = (k / n * 100) + '%';
    $('#tourtext').textContent = k >= n ? `${data.title}：完成！` : `${data.title}：第 ${k + 1}／${n} 站・${stops[k].name}`;
  }
  function showCard(t, next) {
    const it = data.intros[t.name]; if (!it) return false;
    $('#tctitle').textContent = it.title; $('#tctext').textContent = it.text; $('#tcsrc').textContent = '資料來源：' + it.src;
    const b = $('#tcnext'); b.textContent = next ? (idx + 1 >= stops.length ? '完成任務' : '下一站') : '關閉';
    b.onclick = () => { $('#tourcard').hidden = true; card = false; if (next) advance(); };
    $('#tourcard').hidden = false; card = true; return true;
  }
  function go() { const t = stops[idx]; guide.setDest(t); guide.startRoute(false); render(); }
  function start() { if (!stops.length) return; active = true; idx = 0; ui.toast(`任務開始：依序走到 ${stops.length} 個地點`); go(); }
  function stop() { active = false; card = false; $('#tourcard').hidden = true; render(); }
  function advance() { idx++; if (idx >= stops.length) { render(); guide.cancelRoute(); ui.toast('任務完成！'); setTimeout(() => { if (idx >= stops.length) stop(); }, 2500); return; } go(); }
  function arrived(t) { if (!t || curF() !== t.f) return false;
    if (t.X0 !== undefined) return S.x > t.X0 && S.x < t.X1 && S.z > t.Z0 && S.z < t.Z1;
    return Math.hypot(S.x - t.x, S.z - t.z) <= R; }
  function update() {
    if (!active || card || idx >= stops.length) return;
    const t = stops[idx]; if (arrived(t)) { guide.cancelRoute(); render(); if (!showCard(t, true)) advance(); }
  }
  // 非任務的自動導覽抵達時（main_dx.js onArrived）
  const onArrived = (t) => { if (!active && t) showCard(t, false); };

  // ---- 互動提示 ----
  let hint = null;
  function findHint() {
    const f = curF(), y = LY(f); if (Math.abs(S.y - y) > 0.6) return null;
    let best = null, bd = 1.8;
    for (const r of m.BYFLOOR[f]) { const d = r.door; if (!d || !d.out || r.solid) continue;
      const dd = Math.hypot(S.x - d.out.x, S.z - d.out.z); if (dd < bd && !(S.x > r.X0 && S.x < r.X1 && S.z > r.Z0 && S.z < r.Z1)) { bd = dd; best = { kind: 'room', r, label: `查看〈${r.name}〉` }; } }
    if (best) return best;
    for (const s of STAIRS) { if (!s.fl.includes(f)) continue; const g = 1.2;
      if (S.x > s.X0 - g && S.x < s.X1 + g && S.z > s.Z0 - g && S.z < s.Z1 + g) {
        const up = f < 3 && s.fl.includes(f + 1) ? f + 1 : null, dn = f === 0 ? (s.fl.includes(4) ? 4 : null) : (f === 4 ? (s.fl.includes(0) ? 0 : null) : f - 1);
        const to = up ?? dn; if (to === null || to === undefined) continue;
        return { kind: 'stair', to, label: `到 ${levelLabel(to)}` }; } }
    return null;
  }
  function updateHint() {
    hint = (S.mode === 'bird' || S.walker || card) ? null : findHint();
    const el = $('#hint'); el.hidden = !hint; if (hint) el.innerHTML = `<kbd>E</kbd> ${hint.label}`;
  }
  function interact() {
    if (!hint) return false;
    if (hint.kind === 'room') { guide.setDest(hint.r); ui.toast(hint.r.name); }
    else guide.gotoFloor(hint.to);
    hint = null; $('#hint').hidden = true; return true;
  }

  function bind() { $('#tourstart').onclick = start; $('#tourstop').onclick = stop; $('#hint').onclick = interact; render(); }
  return { start, stop, update, updateHint, interact, onArrived, bind, get state() { return { active, idx, n: stops.length, card, hint: hint && hint.label, stops: stops.map(t => t.name) }; } };
}
