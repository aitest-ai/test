// 鏡頭層（狀態機）：third 第三人稱（指數平滑＋遮擋收近＋方位角速度上限＋鏡頭速度上限）／guide 導覽中（同 third，
// 另由 player.js 自動轉向）／first 第一人稱／bird 鳥瞰。每個狀態只算「理想姿態」；狀態改變時從切換當下的鏡頭姿態
// 以 smoothstep 位置插值＋四元數球面插值過渡 BLEND 秒，不會一幀跳過去。瞬移（傳送、切樓層）用 reset() 直接到位。
// 遮擋與天花板查詢走物理層的 world.ray / world.ceilingY，不讀 three 網格。
import * as THREE from 'three';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export function createCameraRig({ S, m, world, camera, ch }) {
  const { LY } = m;
  const camPos = new THREE.Vector3(), camPrev = new THREE.Vector3(), camPrevS = { x: 0, z: 0 };
  let camPrevInit = false, camTh = 0, camThInit = false, camInit = false, camLim = Infinity;

  function updateThird(dt, tgt, inRoom) {
    const bx = -Math.sin(S.yaw), bz = -Math.cos(S.yaw), pE = clamp(inRoom ? Math.max(S.pitch, 0.5) : S.pitch, -0.2, 1.2), cp = Math.cos(pE), spn = Math.sin(pE);
    const want = S.dist, t = world.ray(S.x, S.z, S.x + bx * want * cp, S.z + bz * want * cp, S.y, 0.2), dA = clamp(t * want - 0.1, 0.9, want);
    S.occ = t * want < want * 0.8;
    const des = new THREE.Vector3(S.x + bx * dA * cp, tgt.y + spn * dA, S.z + bz * dA * cp);
    des.y = Math.max(Math.min(des.y, world.ceilingY(des.x, des.z, S.y) - 0.15), S.yCam + 0.35);
    if (!camInit) { camPos.copy(des); camInit = true; camLim = Infinity; camPrevInit = false; camThInit = false; }
    camPos.lerp(des, 1 - Math.exp(-dt * 6.5));
    { const ex = camPos.x - S.x, ez = camPos.z - S.z, Lh = Math.hypot(ex, ez);       // 繞角色的方位角速度上限：U 形轉彎／進出梯間時鏡頭不會甩動
      if (Lh > 0.3) { const th = Math.atan2(ex, ez); if (camThInit) { const w = (S.occ ? 3.4 : 2.6) * dt, dth = clamp(angDiff(camTh, th), -w, w); camTh += dth; } else camTh = th; camThInit = true;
        camPos.x = S.x + Math.sin(camTh) * Lh; camPos.z = S.z + Math.cos(camTh) * Lh; } }
    { const ex = camPos.x - S.x, ez = camPos.z - S.z, Lh = Math.hypot(ex, ez);
      if (Lh > 0.05) { const t2 = world.ray(S.x, S.z, camPos.x, camPos.z, S.y, 0.16), Lallow = t2 < 1 ? Math.max(0.9, t2 * Lh - 0.1) : Lh;
        if (!isFinite(camLim) || Lallow >= camLim) camLim = Lallow; else camLim += (Lallow - camLim) * (1 - Math.exp(-dt * 9));
        const Ls = Math.min(Lh, camLim), k = Ls / Lh; camPos.x = S.x + ex * k; camPos.z = S.z + ez * k; if (k < 1) camPos.y = tgt.y + (camPos.y - tgt.y) * k; }   // 沿視線等比收近（3D 徑向），視線方向不變
      camPos.y = Math.max(Math.min(camPos.y, world.ceilingY(camPos.x, camPos.z, S.y) - 0.15), S.yCam + 0.35); }
    { const vp = dt > 0 ? Math.hypot(S.x - camPrevS.x, S.z - camPrevS.z) / dt : 0;       // 鏡頭速度上限：避免被遮擋/解除遮擋時單幀大跳（爬樓梯、進門的晃動來源）
      if (camPrevInit) { const mx = camPos.x - camPrev.x, my = camPos.y - camPrev.y, mz = camPos.z - camPrev.z, L = Math.hypot(mx, my, mz), cap = (6 + 1.3 * Math.min(vp, 9)) * dt;
        if (L > cap) camPos.set(camPrev.x + mx / L * cap, camPrev.y + my / L * cap, camPrev.z + mz / L * cap); }
      camPrev.copy(camPos); camPrevS.x = S.x; camPrevS.z = S.z; camPrevInit = true; }
    const d = Math.hypot(camPos.x - S.x, camPos.z - S.z);
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(tgt); ch.group.visible = d > 0.95;
  }

  const BLEND = 0.8, from = { p: new THREE.Vector3(), q: new THREE.Quaternion(), chVis: true }, toQ = new THREE.Quaternion();
  let state = null, blendT = BLEND;
  const stateOf = () => S.mode === 'third' && S.walker ? 'guide' : S.mode;
  function update(dt, inRoom) {
    const next = stateOf();
    if (next !== state) {
      const fromThirdish = state === 'third' || state === 'guide', toThirdish = next === 'third' || next === 'guide';
      if (state !== null && !(fromThirdish && toThirdish)) { from.p.copy(camera.position); from.q.copy(camera.quaternion); from.chVis = ch.group.visible; blendT = 0; }
      if (toThirdish && !fromThirdish) camInit = false;   // 第三人稱的平滑狀態從新姿態起算；畫面連續由過渡負責
      state = next;
    }
    const tgt = new THREE.Vector3(S.x, S.yCam + 1.35, S.z);
    if (state === 'third' || state === 'guide') updateThird(dt, tgt, inRoom);
    else if (state === 'first') {
      camera.position.set(S.x, S.yCam + 1.5, S.z); camera.up.set(0, 1, 0); const p = -(S.pitch - 0.1);
      camera.lookAt(S.x + Math.sin(S.yaw) * Math.cos(p) * 5, S.yCam + 1.5 + Math.sin(p) * 5, S.z + Math.cos(S.yaw) * Math.cos(p) * 5); ch.group.visible = false;
    } else { const base = S.viewFloor === null ? S.y : LY(S.viewFloor); camera.position.set(S.x, base + S.birdH, S.z + 0.01); camera.up.set(Math.sin(S.byaw), 0, Math.cos(S.byaw)); camera.lookAt(S.x, base, S.z); ch.group.visible = true; }
    if (blendT < BLEND) {                                   // 過渡：從切換當下的姿態滑到新狀態的理想姿態
      blendT = Math.min(BLEND, blendT + dt); const u = blendT / BLEND, e = u * u * (3 - 2 * u);
      camera.position.lerpVectors(from.p, camera.position, e); toQ.copy(camera.quaternion); camera.quaternion.slerpQuaternions(from.q, toQ, e);   // 目標須先複製：slerpQuaternions 會先把輸出設成起點
      if (e < 0.5) ch.group.visible = from.chVis;
    }
  }
  // 瞬移／切樓層：下一幀直接放到理想位置（不從舊位置滑過去，也取消進行中的過渡）
  function reset() { camInit = false; camLim = Infinity; blendT = BLEND; }
  return { update, reset, get state() { return state; }, get blending() { return blendT < BLEND; } };
}
