// 蒲牢．鐘吼 third-person LOD (teammates' hands, def.tpModel): the same model (pulao.mjs) decimated to 1.2 mm with the
// small pieces pruned and a coarser bake grid; the viewmodel keeps the full pulao.glb.
import pulao from './pulao.mjs';

export default async function build() {
  const g = await pulao();
  g.id = 'pulao_tp';
  g.lod = 1;
  return g;
}
