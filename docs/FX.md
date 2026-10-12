# Effects (FX) guide — 災厄前線 CALAMITY FRONT

Combat effects modelled on **Counter-Strike 2** (realistic gunfire, impacts, blood, grenades) with a
**CSO** layer for zombie hits and a toolkit for premium / special weapons. Research and measurements:
`docs/research/06a-cs2-fx.md` (CS2, frame by frame) and `docs/research/06b-cso-fx.md` (CSO).

**Legal rule.** Everything is recreated from observation. All textures are generated procedurally at
runtime by our own shaders (`game/src/fx/atlas.js`); no texture, model, particle definition or sound is
ever extracted or downloaded from a game or a rip site. Reference frames may only be viewed / saved under
`captures/refs/` (gitignored), never committed.

## Modules (`game/src/fx/`)

| File | What |
|---|---|
| `fx.js` | Facade (`game.fx`): muzzle flashes, barrel smoke, tracers, impacts, blood, gibs, knock dust, explosions, grenades, premium toolkit, scene-light estimate |
| `atlas.js` | GPU texture generator: FX atlas (8×8), decal atlas (4×4 colour + normal), HDR temperature ramps. `FRAME`, `DECAL`, `RAMP` enums |
| `particles.js` | Instanced CPU-simulated particles (world + viewmodel layers), render modes and shading (below) |
| `decals.js` | Modulate-2× decals with normal-mapped crater shading, fading, edge fitting |
| `shells.js` | Casings + MG belt links (tumbling, bounces, clink sound, specular glint) |
| `lights.js` | Fixed light pool: one-shot `flash()` (1-frame hold then (1−u)²) and keyed `hold()` lights |
| `ribbons.js` | Trails, blade slash ribbons, energy beams, lightning bolts (one draw call world + one viewmodel) |
| `smokevol.js` | CS2 smoke grenades: flood-filled lit puff volume, bullet tunnels, HE holes, in-smoke overlay |
| `inferno.js` | Molotov / incendiary fire spreading over the floor |
| `screenfx.js` | Flashbang white-out + frozen afterimage, short screen kicks (via `renderer.post.flashColor`) |

Callers: `weapons/arsenal.js` (muzzle, tracers with CS2 cadence, casings, rocket trail),
`weapons/ballistics.js` (impacts, `bulletPath` for smoke tunnels), `weapons/throwables.js` (frag → `explosion`,
incendiary → `molotov`), `zombies/manager.js` + bosses (blood, gibs, explosions, raw `particles.spawn`).

## Textures

Generated once per renderer and size (2048² on medium+, 1024² on low) and shared by every match. The
generator programs compile **asynchronously** (`renderer.compileAsync`, KHR_parallel_shader_compile); loops use
a uniform bound (`DYN(n)`) so slow shader compilers (ANGLE / D3D11) don't unroll them — compile is ~0.1–1 s
on desktop, near-instant on phones. Until ready the atlases are transparent (effects invisible, nothing breaks).
Dev: `game.fx.textures.debugURL('fx' | 'fxramp' | 'decal')` returns a PNG data URL of an atlas (`'fxramp'`
shows the temperature cells — muzzle, cones, fire — through the gunfire ramp instead of their raw channels).

### FX atlas cells (`FRAME`)

Cells 0–15 keep the legacy numbering other modules pass as plain numbers (1, 3, 7, 10, 11, 12 are used that
way); the legacy cells nothing used any more were re-used for CS2 looks.

| Cells | Content | Notes |
|---|---|---|
| 0 glow, 1–2 smoke, 3 spark, 7 drop, 10 flame, 11 ring, 12 dust, 14 hole, 15 splat | legacy masks | `3` is the tracer / spark streak: head (u = 1) bright, tail fades |
| 4, 5, 6, 8 `flick` (array) | 4 wispy fire fragments: a lumpy burning-gas body with 2–4 licking tongues, domain-warped, full of vertical ridged filaments with see-through gaps | volumetric (ramp), rising along +x: draw with `mode: 'align', dir: UP`; the molotov sheet is built from these |
| 9, 13 `mist` (array) | 2 streaky blood-mist clouds: a lumpy spray cone opening along +x from the wound (u = 0.12), fine radial streaks, specks | RGB = thinness (thin parts lighter), A = mask |
| 16–31 `muzzle` | 4 cloud shapes × 4 frames (`16 + shape*4 + frame`): 0 fluffy lobes (AK), 1 tight round with short licks (pistols / M4 from behind), 2 soft 5-tongue star, 3 long forward tongue + side puffs (Deagle / snipers) | volumetric: B = temperature, A = density; licking tongues, ridged-turbulence filaments (bright streaks with darker gaps), the cloud boils and breaks into wisps over the 4 frames; core at u = 0.29, forward = +x |
| 32–35 `cone` | flame cones, thin prong, split tongue | +x forward, base at the left |
| 36 `star4`, 37 `prongs` | third-person front star, birdcage side prongs | |
| 38–45 `fire` | 8-frame **seamless** flame flipbook (ramp), rising along +x: narrow root, body tearing into 2–3 licking tongues, tips detaching; the root fades softly so floor intersections never show a cut | noise scrolls upwards, the loop blends two time samples (variance preserving); draw with `mode: 'align', dir: UP` |
| 46–49 `spray` | 4-frame directional blood spray (+x = bullet) | |
| 50–53 `puff` | big billowy smoke bodies filling the cell, smooth fbm billows for the relief, wispy feathered rim | RG = normal, B = thickness / temperature broken up by turbulence (fireball cores never read as round glowing balls), A = density |
| 54–55 `dusty` | grainy, irregular dust (impacts, blood mist, knockback dust) | same channels |
| 56 splinter, 57 shard, 58 rock, 59 clod, 60 splash, 61 wisp, 62 thin ring, 63 glint | debris and misc | splash / wisp run along +x |

### Decal cells (`DECAL`)

`concrete, plaster, metal, wood, glass, sand, metalExit, blood, blood2, blood3, scorch, pool, tile, slash, splat, acid`.
Concrete / plaster / tile holes (CS2): a dark irregular pit, a jagged chipped crater of fresh (brighter) facets
with fracture lines between them, 6 hairline radial cracks and a dusty powder stain around.
Colour half stores a *modulate ratio* (0.5 = unchanged), so a decal darkens or brightens whatever surface it
lands on and inherits its lighting / shadows / lightmaps (Source's bullet-hole trick). The normal half gives
crater shading relative to the flat surface and wet blood a specular glint. Blood / acid / zombie / CSO tints
are per instance (`DECAL_TINT`).

### Ramps (`RAMP`)

HDR temperature → colour rows: `gunfire` (06a §6), `explosion`, `flame`, `blue`, `green`, `purple`, `red`, `gold`.
Fire-type particles multiply `ramp(textureTemperature × heat)`; heat decays over the particle's life so flames
burn out from the edges inwards (white-yellow → orange → dark red).

## Particle API

`game.fx.particles.spawn(o)`; numbers are metres / seconds / HDR linear colour.

| Option | Meaning |
|---|---|
| `x y z`, `vx vy vz` | position, velocity |
| `life`, `delay` | lifetime; start delay (hidden until then) |
| `size`, `size1`, `sizePow` | size curve (pow < 1 = fast growth, smoke) |
| `color`, `color1`, `colorPow`, `fadeIn` | RGBA curve (additive: HDR ok) |
| `gravity`, `drag`, `spin`, `rot`, `collide`, `bounce` | motion |
| `frame`, `frames`, `fps`, `loop`, `frameOffset` | atlas cell / flipbook (fps 0 = spread over life; frames blend) |
| `mode` | `'billboard'` · `'line'` (3D streak, also implied by `stretch` > 0; `stretch` = tail length in seconds of velocity, min 2.4 px wide) · `'align'` (x axis follows the **perspective-correct** screen direction of `dir` at the particle — a barrel pointing into the screen projects towards its vanishing point; `aspect`, `anchor` 0..1 shifts the quad forward, `mirror`) · `'flat'` (quad ⟂ `dir`) |
| `ramp`, `heat`, `heat1`, `heatPow` | temperature shading (fire) |
| `lit` | normal-mapped smoke lit by the scene sun / sky / ground (else alpha particles take the average scene light). `lit` + `ramp` on an alpha particle = lit smoke with an emissive temperature core (`ramp(B × heat)` added): explosion fireballs that cool into charcoal smoke |
| layer `flat` | `particles.makeLayer(max, { flat })` flattens lit normals (0..1) for big soft volumes (smoke grenades use 0.45) |
| `additive`, `vm`, `inertia` | layer; viewmodel layer (camera space, viewmodel projection); fraction of camera motion a vm particle ignores (barrel smoke trails behind when you turn / run) |
| `far` | `true` / `'sqrt'`: the size grows with the viewer's **apparent** distance (distance ÷ weapon zoom) past 12 m, up to 2.6× (sqrt: 1.6×), computed in the vertex shader every frame for whoever is looking — CS2 impacts stay readable at range, but walking up to a far hit or looking through a scope never shows an oversized puff |
| `ground`, `soft` | floor height + fade height (m): analytic soft particles against the floor plane — the quad fades out over `soft` metres above `ground`, so flames, floor dust, fireballs and smoke never show the hard line where the depth test cuts them (no depth copy needed) |

## Effects

### Muzzle flash — `fx.muzzle(kind, pos, dir, opts)`

`kind` = `def.flash` (`pistol, magnum, smg, rifle, mg, shotgun, sniper, rocket`). `opts`: `vm`, `weapon` (id →
per-model refinements), `lightPos`, `scale`, `ramp` (premium colour) or `color` (HDR, mapped to a ramp),
`suppressed`.

First person (CS2 §2, checked against Valve's M4A4-in-shadow clip): the flash reads as a **peach-orange glow
volume** about 3× the front-sight height, only a small core clips to yellow-white. Layers: small overexposed core;
a cloud-shaped peach halo (muzzle cell at low heat, ~0.34 m × k); the turbulent fire cloud(s) aligned with the
barrel's perspective-correct screen direction, so the flame streams towards the barrel's vanishing point
(random shape, random mirror, ±15 % size and brightness, heat 0.86 so the body stays peach-orange); sometimes a
long tongue, muzzle-brake side jets (AWP / Barrett / revolver), 1–15 powder sparks; frame 2–3 is a dim
translucent salmon cloud, then grey smoke that partly stays in the world. Lasts ~55 ms: 1 full frame + 2
decaying frames at 60 fps. Lights: a saturated orange one 0.3 m ahead of / 0.1 m above the muzzle that turns the
handguard, rails, front sight and glove hot orange for one frame (`vmLight` per class, pistols lower so slides
don't blow out), and an environment light 1.5 m ahead for walls and floor.
Third person: hot core + a camera-facing fire cloud + flame cone along the barrel + a small 4-prong star
(+ birdcage prongs, side jets) + smoke + light.
Per-class sizes (AK = 1), calibrated against frame grabs of CS2 hip fire on Dust II (share of screen width at
the brightest frame: Glock ~4.5 %, Galil ~7 %, Nova ~6 %, XM1014 ~9 %, Deagle ~13.5 %, AWP ~18 %): pistol 0.5–0.55,
Deagle 0.95 and revolver 1.05 as a **soft round yellow-orange glow cloud** (fluffy shapes, big halo, no long
tongue), SMG 0.72–0.92, rifle 0.85–1, MG ~1, shotgun 1.25 (orange cloud that sags below the barrel towards the
hands, double barrel 1.5), sniper 1.4–1.5 (big diffuse glow, small brake jets). Barrel heat
accumulates per shot; after sustained fire thin wisps curl up from the muzzle. Thin gun smoke uses the soft
legacy smoke cells (not the billowy puffs). Viewmodel smoke ignores teleports (no smoke flung across the screen
on spawn / respawn).

### Tracers — `fx.tracer(from, to, { cls })`

CS2 cadence (`TRACER_EVERY`, from weapons.vdata): pistols / snipers / shotguns / MGs every shot; rifles / SMGs
every 3rd shot of a spray, first shot always; suppressed none; shotguns trace 3 pellets. Looks per class
(speed / length / width / core + glow colour) in `TRACER`. First-person tracers start 1.5 m out and the tail
never reaches behind the start, so you see a short streak racing to the crosshair.

### Impacts — `fx.impact(surf, point, normal, dir, { decal, big, exit })`

| Surface | Look |
|---|---|
| concrete / brick | lit dust burst (3–5 grainy puffs shooting out along the normal, ~0.95 m, most growth in the first 0.2 s, gone in ~1.2 s) + faint lingering haze + fast dust jet + grit streaks + 4–7 chips + white flash + 25 % spark; jagged chipped crater |
| tile / plaster | whiter, denser, longer dust; cracked tile hole |
| metal | 8–16 bouncing sparks, star glint, tiny light; dented hole with scraped ring (exit: petals) |
| grate | half the sparks, small hole |
| wood | brown dust burst + jet, grit, splinters; fibrous hole aligned with the grain |
| dirt / sand | upward plume, jet, grit, clods; soft crater (sand reads white) |
| glass | shards with bright edges, glint; hole with radial + concentric cracks |
| water | droplet column, splash crown, ripple ring, mist |
| flesh | → `blood()` |

Dust, jets, grit and the hit flash carry `far`: they grow with the viewer's apparent distance past 12 m (up to
2.6× at ~40 m) so far hits stay readable (CS2). Floor hits (dirt, sand, any upward normal) fade softly into the
ground.

### Blood — `fx.blood(point, normal, dir, amount, { acid, color, head })`

CS2 shape with CSO brightness (checked against Valve's `blood_hit_fx` clip): a directional liquid spray leaving
the wound along the bullet (4-frame flipbook), a small dense burst at the wound, droplets, and the mist: 2–3
streaky `mist` cards aligned with the bullet that spread from ~0.2 to ~0.85 m as an irregular, see-through red
spray cloud and thin into pale pink, plus a faint pink haze, gone in ~0.45 s (never a round ball). Directional
splatter on the wall 1–3 m behind and a floor splat (decals: a dense lumpy wet mass, up to 26 radiating fingers
ending in bulbs, 40 satellite drops, glossy raised relief), fading after 20–30 s. Headshots (`amount` ≈ 1.6 or
`head: true`): two sprays, more droplets,
a red flash point and bone bits. `gibs()` throws chunks with blood trails. Zombies shoved hard (`kvel`) or
staggered kick up dust at their feet automatically (`knockDust()` for manual use).

### Grenades

* `fx.explosion(pos, { radius, scale, color })` — HE (checked against Valve's explosion clip): 1–2 frame flash,
  then ONE billowy, opaque fireball (~3 m, 16 lit + ramp puffs; every 4th puff hugs the floor and spreads
  sideways so the mass stays rooted to the ground like Valve's blast, soft floor contact) whose emissive core cools peach-yellow (0.25 s)
  → orange (~1 s) → red-brown with darkening edges (~2 s) → charcoal smoke (heat `0.81 × (1 − t^0.8)`, the
  turbulent B channel keeps it from reading as separate balls), a few flame licks in the first 0.4 s, a charcoal
  column rising above it from ~1 s, debris specks, sparks, ground dust ring, scorch, big light + a lingering
  orange glow, clears smoke, close-range screen kick. `color` greenish → acid blast, grey-brown → rubble (no fire).
* `fx.smoke(pos, { radius, duration, color })` — CS2 smoke (≈0.3 s small, 80 % at 0.6 s, full at 1.2 s,
  18 s, greys out): 48 big billowy puffs (low: 20) on a flood-filled floor grid, soft feathered rims and
  flattened lighting so the volume reads as one soft tan-grey mass, not cotton balls; soft floor contact. Bullets (`fx.bulletPath`,
  called by `fireBullet`) carve tunnels; explosions punch holes.
* `fx.molotov(pos, { radius, duration })` — checked against Valve's Mirage molotov (in the `vfx/explosions`
  clip) and the 2024 Nuke before/after comparison: a continuous, see-through sheet of burning gas, low (~0.4–0.9 m)
  with a tall bright billow where the bottle broke for the first ~1.5 s. Built from overlapping `flick` fire
  fragments (body + a wide low bed), soft glowing billows, a few tall licking tongues, and violet-magenta fuel
  flecks along the base (denser at the outer fringe); cream-white where dense, salmon-orange at the edges. Dark
  brown-grey soot boils up out of the flames and thins as it rises (never a ceiling). Every flame fades softly into
  the floor (`ground`/`soft`), so no cut lines even right next to it. Embers, ground glow, flickering light, scorch;
  fewer but bigger flames on low quality; smoke grenades extinguish it. Gameplay damage stays in `throwables.js`.
* `fx.flashbang(pos)` — world flash + light; local player blinded by angle / distance / cover: full white up
  to 1.88 s, total 4.87 s, fading over a frozen afterimage. The additive HDR white is mapped so that after ACES
  it reads like the spec's `mix(col, white, w)` (`0.9·w / (1.03 − w)`, capped at 30).

## Premium-weapon toolkit (CSO archetypes, 06b §9.7)

| Call | Use |
|---|---|
| `fx.muzzle(kind, pos, dir, { vm, ramp: RAMP.blue })` | recoloured muzzle flash (energy, plasma, holy gold, charged red) |
| `fx.glowTracer(from, to, { color, glow, width, length, speed })` | coloured glowing tracers (energy rifles) |
| `fx.beam(from, to, { core, glow, wCore, wGlow, life, shrink, scroll })` → `{ set(from, to), stop() }` | lasers, rail shots, charge beams (Thunderbolt / Frost Viper style) |
| `fx.bolt(from, to, { col, glow, width, core, levels, jitter, branches, regen, life })` → `{ set, stop }` | lightning chains, arcs (JANUS / Gungnir style) |
| `fx.trail({ width, life, color, color1, taper, profile, vm })` → `t.push(a)` / `t.push(root, tip)` / `t.stop()` | projectile streaks; blade slash trails (push the blade root and tip every frame) |
| `fx.shockwave(pos, { normal, r0, r1, life, color, thin })` | ground rings, muzzle rings, impact shocks |
| `fx.sparkBurst(pos, { color, color1, count, speed, glow, normal })` | energy impacts |
| `fx.explosion(pos, { color })`, `fx.particles.spawn({ ramp: RAMP.green, … })` | coloured blasts and fire |

Weapon definitions can opt in without touching code: `def.fx = { ramp: RAMP.blue, flashScale: 1.2,
tracer: { color: [2, 3.5, 9], glow: [0.6, 1, 3], width: 0.03, length: 4 }, tracerEvery: 1 }` and
`def.suppressed = true` (gas puff, no tracer, tiny light). Special modes (`specials.js` modifiers) set
`flash: 'energy' | 'magma'` and `tracer: [r, g, b]`.

Recipes (from 06b): Thunderbolt = `beam` (core [2.5,3.5,8], glow [0.6,0.5,2.2], wCore 0.02, wGlow 0.16, life 0.6,
shrink 0.4) + blue `sparkBurst` at the hit; JANUS lightning = `bolt` with col [6,3.6,0.6], glow [2.2,1,0.1],
width 0.22, levels 3, jitter 0.06; blade = `trail({ life: 0.14, color: [4,3.2,2.2,1], color1: element×1.5 })`
pushed with root/tip; Balrog charged shot = `muzzle(…, { ramp: RAMP.red })` + `explosion(hit, { scale: 0.35 })`.

## Performance

Particle budgets follow `renderer.q.particles` (low 1200 … ultra 6000); emitters scale counts with
`fx.k = particles / 4000` (0.3–1.5). Draw calls: 4 particle layers, 1 decal mesh, 9 casing meshes (only when
casings exist), 2 ribbon meshes, smoke layer + overlay only while a smoke is alive. Lights come from the fixed
pool (`q.maxLights`); fires hold one keyed light and never take the last free one (muzzle flashes need it).

## Visual QA

Test arena: `http://127.0.0.1:5190/?w=<weapon>&match=0`. Drive frames with `__cf.stop()`, `__cf.step(n)`,
`__cf.input.press('fire')`, call effects directly (`__cf.game.fx.explosion(new V(0, 0.2, 28))`, `V =
__cf.game.camera.position.constructor`) and capture with `tools/shot.mjs --eval`. Look at frames 1–3 of a
shot (flash), a dark scene for the muzzle light (`scene` lights ×0.1), close-ups of decals, and grenades at
0.3 / 0.6 / 1.2 / 4 s. Add `&q=low` to check the phone budget.

Reference frames from Valve's own CS2 page clips (`counter-strike.net/cs2`: `vfx/explosions` — molotov in Mirage +
C4 blast, `vfx/blood_hit_fx`, `smokes_vid1-3`) and public gameplay videos (hip-fire flash sizes on Dust II, the 2024
molotov before/after on Nuke) were only *viewed* in the browser — nothing from them is stored in the repo.
Latest review sets: `captures/fx/f2_sheet_*.png`, `f3_sheet.png` (pistol variance), `c9_sheet.png` (HE + molotov),
all gitignored.
