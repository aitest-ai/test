// 材質入口：由材質 JSON 建材質（見 src/materials/library.js）。預設是東新國小的膜 data/materials.dongxin.json。
// 換校：傳入另一份 JSON（同樣的 roles 名稱），或在網址加 ?skin=<id>（見 main_dx.js）。
import DONGXIN from '../../data/materials.dongxin.json';
import { buildMaterials } from '../materials/library.js';

export function makeMaterials(spec = DONGXIN) { return buildMaterials(spec); }
