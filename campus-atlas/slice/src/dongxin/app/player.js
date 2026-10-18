// 角色層：手動移動（含梯口導引）、自動導覽 walker 推進、走路動畫、鏡頭高度平滑。
// 碰撞一律走 world.move()（物理層），本檔不判斷牆。
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const stairYaw = (s) => s.along === 'x' ? s.sgn * Math.PI / 2 : (s.sgn > 0 ? 0 : Math.PI);   // 站在梯間入口端、朝梯間內看（A→B）

// hooks: { onManualTakeover(), onArrived(target), onStuck() }
export function createPlayer({ S, m, world, input, ch }, hooks) {
  const { LY, UP } = m;
  const curF = () => world.floorOfY(S.y + 0.1);

  function update(dt) {
    S.moving = false;
    const { fwd, turn, str } = input.axes();
    const manual = Math.abs(fwd) > 0.05 || Math.abs(turn) > 0.05 || Math.abs(str) > 0.05;
    if (manual && S.walker) { S.walker = null; hooks.onManualTakeover(); }
    const stairNow = world.stairAt(S.x, S.z, 0), inShaft = !!stairNow && Math.abs(S.y - LY(curF())) > 0.25;
    if (manual && S.mode !== 'bird') {
      S.yaw += turn * 1.9 * S.turnK * dt;
      let mx = Math.sin(S.yaw) * fwd - Math.cos(S.yaw) * str, mz = Math.cos(S.yaw) * fwd + Math.sin(S.yaw) * str; const ml = Math.hypot(mx, mz);
      if (ml > 0.05) { mx /= ml; mz /= ml; const sp = (input.keys.run ? 8.4 : 5.0) * S.speedK * Math.min(1, ml); world.move(S, mx * sp * dt, mz * sp * dt); S.moving = true;
        { const sA = world.stairAt(S.x, S.z, 0.3);                                      // 梯口導引：朝梯間直走時，輕推向最近的梯跑中線（梯口中央是分隔牆，不用精準對位）
          if (sA && Math.abs(S.y - LY(curF())) < 0.2) { const [u, v] = world.stairLoc(sA, S.x, S.z), fU = (sA.along === 'x' ? mx : mz) * sA.sgn;
            if (fU > 0.3 && u < sA.uA + 0.2 && u > sA.uA - 1.6) { const cf = curF(), canDn = m.DN[cf] >= 0 && sA.fl.includes(m.DN[cf]), canUp = UP[cf] >= 0 && sA.fl.includes(UP[cf]);
              const tv = (-sA.fs * v > 0.3 && canDn) || !canUp ? -sA.fs * sA.lane : sA.fs * sA.lane, dv = clamp((tv - v) * 2.6, -1.8, 1.8) * dt; world.move(S, sA.along === 'x' ? 0 : dv, sA.along === 'x' ? dv : 0); } } }
        S.heading += angDiff(S.heading, Math.atan2(mx, mz)) * Math.min(1, dt * 12); }
      else S.heading += angDiff(S.heading, S.yaw) * Math.min(1, dt * 8);
    } else if (S.walker) {
      const px = S.x, pz = S.z; S.walker.step(S, dt, 5.6 * S.speedK); S.moving = Math.hypot(S.x - px, S.z - pz) > 1e-4;
      if (S.moving) S.heading += angDiff(S.heading, Math.atan2(S.x - px, S.z - pz)) * Math.min(1, dt * 10);
      if (!input.recentlyDragged(900)) { const lim = (S.occ ? 3.0 : 1.5) * dt;          // 導覽中鏡頭預判轉彎；梯段內朝梯跑方向
        S.yaw += clamp(angDiff(S.yaw, inShaft ? stairYaw(stairNow) : S.walker.ahead(S, 3.2)) * (S.occ ? 4 : 2.2) * dt, -lim, lim); }
      if (S.walker.done) hooks.onArrived(S.selected);
      else if (S.walker.stuck) { S.walker = null; hooks.onStuck(); }
    }
    S.walkT += dt * (S.moving ? 9 * Math.max(0.7, S.speedK) : 0); const sw = Math.sin(S.walkT) * 0.75 * (S.moving ? 1 : 0);
    ch.limbs.legL.rotation.x = sw; ch.limbs.legR.rotation.x = -sw; ch.limbs.armL.rotation.x = -sw * 0.9; ch.limbs.armR.rotation.x = sw * 0.9;
    S.yCam += (S.y - S.yCam) * Math.min(1, dt * 7);
    ch.group.position.set(S.x, S.y + Math.abs(Math.sin(S.walkT)) * 0.04 * (S.moving ? 1 : 0), S.z); ch.group.rotation.y = S.heading;
  }
  return { update, curF };
}
