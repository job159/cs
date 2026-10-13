// Premium FX kit (docs/PREMIUM_WEAPONS.md §1.7.5, §4.2 row 0.5): the reusable CSO-style components every
// premium weapon is built from, hung on the FX facade so clips, specials and the test range reach them as
//   fx.overlay  TINT / RADIAL / TUNNEL / RIFT / CLOUDSEA / ink filter / CURTAIN + CSO status overlays (overlays.js)
//   fx.summons  GHOST dissolve summons, SHADOW puppets, instanced swarms, exits                     (summons.js)
//   fx.wings    WING feather fans on the viewmodel or a third-person socket                          (wings.js)
//   fx.sigils   SIGIL magic circles (original procedural atlas), PILLAR, RING                        (sigils.js)
//   fx.motes    falling sprites: feathers, petals, paper, porcelain shards, ink drops; TRAIL_DROP    (motes.js)
// Everything is procedural (nothing is taken from any game) and seedable, so a networked skill event
// { id, seed, pos, dir } replays the same look on every client (§1.7.4).
import { Overlays } from './overlays.js';
import { Summons } from './summons.js';
import { Wings } from './wings.js';
import { Sigils } from './sigils.js';
import { Motes } from './motes.js';
import { noiseTexture } from './kitutil.js';

export { rng, easeOutBack, smooth, hdr } from './kitutil.js';

export class PremiumKit {
  constructor(fx) {
    this.fx = fx;
    this.game = fx.game;
    this.quality = fx.game.renderer?.qualityName || (fx.k < 0.5 ? 'low' : 'high');
    this.low = this.quality === 'low';
    this.time = { value: 0 };
    this.noise = { value: noiseTexture() };
    this.overlay = new Overlays(this);
    this.motes = new Motes(this);
    this.sigils = new Sigils(this);
    this.summons = new Summons(this);
    this.wings = new Wings(this);
    fx.overlay = this.overlay; fx.motes = this.motes; fx.sigils = this.sigils; fx.summons = this.summons; fx.wings = this.wings;
  }

  /**
   * Data-driven entry for clip / skill events using the spec's component codes (§1.7.5, Appendix A
   * `overlay: { fx: 'TUNNEL', look: 'wave_pipe' }`): play('TUNNEL', { look, dur }), play('SIGIL', { pos, design }),
   * play('GHOST', {...}), play('POISON', { amt, dur })... Returns the component's handle (null if unknown).
   */
  play(code, o = {}) {
    const ov = this.overlay;
    switch (String(code).toUpperCase()) {
      case 'TINT': return ov.tint(o.color, o.alpha ?? o.amt ?? 0.2, o.dur ?? 0.6, o);
      case 'RADIAL': return ov.radial(o.amt ?? 1, o.dur ?? 0.35, o);
      case 'TUNNEL': return ov.tunnel(o.dur ?? 2.5, o);
      case 'RIFT': return ov.rift(o.dur ?? 1.2, o);
      case 'CLOUDSEA': return ov.cloudsea(o.dur ?? 4, o);
      case 'CURTAIN': return ov.curtain(o.dur ?? 3, o);
      case 'INK': return ov.ink(o.amt ?? 1, o.dur ?? Infinity, o);
      case 'BORDER': return ov.border(o.color, o.alpha ?? o.amt ?? 0.25, o.dur ?? Infinity, o);
      case 'BURN': case 'FIRE': case 'POISON': case 'FROST': case 'ELECTRIC': return ov.status(String(code).toLowerCase(), o.amt ?? 1, o.dur ?? 1.2, o);
      case 'SIGIL': return this.sigils.sigil(o.pos, o);
      case 'PILLAR': return this.sigils.pillar(o.pos, o);
      case 'RING': return this.sigils.ring(o.pos, o);
      case 'GHOST': return this.summons.ghost(o);
      case 'SHADOW': return this.summons.shadow(o.pos, o);
      case 'SWARM': return this.summons.swarm(o);
      case 'WING': return o.parent ? this.wings.attach(o.parent, o) : this.wings.vm(o);
      case 'MOTE': return this.motes.burst(o.kind || 'goldpaper', o.pos, o.count ?? 8, o);
      case 'TRAIL_DROP': return this.motes.trailDrop(o.from, o.to, o.kind || 'feather', o);
    }
    return null;
  }

  update(dt) {
    this.time.value += dt;
    this.overlay.update(dt);
    this.sigils.update(dt);
    this.summons.update(dt);
    this.wings.update(dt);
    this.motes.update(dt);
  }

  clear() {
    this.overlay.clear(); this.sigils.clear(); this.summons.clear(); this.motes.clear();
  }
}
