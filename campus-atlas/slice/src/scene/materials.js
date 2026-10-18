// 材質入口：由材質 JSON 建材質（見 src/materials/library.js）。預設是東新國小的膜 data/materials.dongxin.json。
// 換校：傳入另一份 JSON（同樣的 roles 名稱），或在網址加 ?skin=<id>（見 main_dx.js）。
// 圖片型紋理的圖檔放 assets/textures/，由 Vite 打包（雜湊檔名；單檔版內嵌），JSON 只寫檔名。
import DONGXIN from '../../data/materials.dongxin.json';
import { buildMaterials } from '../materials/library.js';

const TEX_URLS = import.meta.glob('../../assets/textures/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' });
export const resolveTexture = (src) => TEX_URLS['../../assets/textures/' + src];

export function makeMaterials(spec = DONGXIN) { return buildMaterials(spec, { resolve: resolveTexture }); }
