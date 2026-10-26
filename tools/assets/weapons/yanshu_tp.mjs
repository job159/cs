// 焰樞．破限 third-person LOD (teammates' hands, def.tpModel): the same model (yanshu.mjs) decimated to 8 mm with the small
// pieces pruned and a coarser bake grid; the viewmodel keeps the full yanshu.glb.
import yanshu from './yanshu.mjs';

export default async function build() {
  const g = await yanshu();
  g.id = 'yanshu_tp';
  g.lod = 1;
  return g;
}
