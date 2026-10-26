// 春霆神戟．驚蟄 third-person model (teammates' hands, def.tpModel): the same model (chunting.mjs) decimated to 0.9 mm
// with the small pieces pruned and a coarser bake grid (g.lod 1); the inspect-only light ring (fx_ding) is left out.
// The viewmodel keeps the full chunting.glb.
import chunting from './chunting.mjs';

export default async function build() {
  const g = await chunting();
  g.id = 'chunting_tp';
  g.lod = 1;
  g.parts.delete('fx_ding');
  return g;
}
