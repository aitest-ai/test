// 鏡頭層：第三人稱（指數平滑＋遮擋收近＋方位角速度上限＋鏡頭速度上限）、第一人稱、鳥瞰。
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

  function update(dt, inRoom) {
    const tgt = new THREE.Vector3(S.x, S.yCam + 1.35, S.z);
    if (S.mode === 'third') updateThird(dt, tgt, inRoom);
    else if (S.mode === 'first') {
      camera.position.set(S.x, S.yCam + 1.5, S.z); camera.up.set(0, 1, 0); const p = -(S.pitch - 0.1);
      camera.lookAt(S.x + Math.sin(S.yaw) * Math.cos(p) * 5, S.yCam + 1.5 + Math.sin(p) * 5, S.z + Math.cos(S.yaw) * Math.cos(p) * 5); ch.group.visible = false;
    } else { const base = S.viewFloor === null ? S.y : LY(S.viewFloor); camera.position.set(S.x, base + S.birdH, S.z + 0.01); camera.up.set(Math.sin(S.byaw), 0, Math.cos(S.byaw)); camera.lookAt(S.x, base, S.z); ch.group.visible = true; }
  }
  // 瞬移／換模式後：下一幀直接放到理想位置（不從舊位置滑過去）
  function reset() { camInit = false; camLim = Infinity; }
  return { update, reset };
}
