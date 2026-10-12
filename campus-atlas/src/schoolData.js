// 校園資料層。其中第一棟採外觀照片參照，其餘尺寸、位置、教室配置仍為示意。
// 長度單位：公尺。座標 [x, z]，校園中心為 [0,0]。
export const school = {
  name: '東新國小・建模草案',
  site: { width: 122, depth: 100 },
  spawn: { x: 0, z: 18, heading: Math.PI },
  buildings: [
    { id: 'a', name: '新校舍・紅磚教室棟', tag: 'PHOTO-GUIDED BLOCK', kind: '外觀照片參照', facadeReference: true, color: '#b66e51', x: -22, z: -25, width: 40, depth: 12, floors: 3, floorHeight: 3.6, front: 'south', roomCount: 4, rooms: [
      ['示意教室 1-1', '示意教室 1-2', '示意教室 1-3', '示意教室 1-4'],
      ['示意教室 2-1', '示意教室 2-2', '示意教室 2-3', '示意教室 2-4'],
      ['示意教室 3-1', '示意教室 3-2', '示意教室 3-3', '示意教室 3-4'] ] },
    { id: 'b', name: '知行樓', tag: 'TEACHING BLOCK B', kind: '教學大樓', color: '#d2b4a1', x: 26, z: -25, width: 36, depth: 12, floors: 4, floorHeight: 3.55, front: 'south', roomCount: 4, rooms: [
      ['四年一班', '四年二班', '四年三班', '閱讀角'],
      ['五年一班', '五年二班', '五年三班', '藝文教室'],
      ['六年一班', '六年二班', '六年三班', '資訊教室'],
      ['創客教室', '美術教室', '音樂教室', '研究教室'] ] },
    { id: 'c', name: '行政樓', tag: 'ADMINISTRATION', kind: '行政空間', color: '#a7bab0', x: -41, z: 24, width: 22, depth: 12, floors: 2, floorHeight: 3.7, front: 'north', roomCount: 3, rooms: [
      ['校長室', '教務處', '學務處'], ['會議室', '教師辦公室', '輔導室'] ] },
    { id: 'd', name: '活動中心', tag: 'ACTIVITY HALL', kind: '活動場地', color: '#a1b6be', x: 41, z: 26, width: 27, depth: 18, floors: 1, floorHeight: 9, front: 'north', roomCount: 1, rooms: [ ['室內活動場'] ] },
  ],
  places: [
    { id: 'court', name: '中庭球場', kind: '戶外運動', x: 23, z: 7 },
    { id: 'garden', name: '綠蔭花園', kind: '戶外休憩', x: -28, z: 4 },
    { id: 'gate', name: '校園大門', kind: '校園入口', x: 0, z: 48 }
  ]
};

export function allRooms(){
  return school.buildings.flatMap(b => b.rooms.flatMap((row,fi)=>row.map((name,ri)=>({
    id: `${b.id}-${fi+1}-${ri+1}`, name, building:b, floor:fi+1, index:ri,
    x:b.x-b.width/2+(ri+.5)*b.width/b.roomCount,
    z:b.z+(b.front==='south'?b.depth/2+2:-b.depth/2-2)
  }))));
}