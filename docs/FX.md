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
| `kit.js` + `kitutil.js` | Premium FX kit facade (`fx.overlay`, `fx.summons`, `fx.wings`, `fx.sigils`, `fx.motes`), seeded PRNG, shared tiling noise texture — see *Premium FX kit* below |
| `overlays.js` | Full-screen overlays (TINT, RADIAL, TUNNEL, RIFT, CLOUDSEA, ink filter, CURTAIN, BORDER fallback) + CSO status overlays (burn, poison, frost, electric) |
| `summons.js` | GHOST glazed-spirit summons (dissolve in / out, exit motes), SHADOW puppet clones, instanced SWARM flocks, built-in spirit shapes |
| `wings.js` | WING feather fans (glow / cloisonné) on the viewmodel or a third-person socket |
| `sigils.js` | SIGIL magic-circle atlas (12 original procedural designs) + PILLAR light columns + RING |
| `motes.js` | Falling theme sprites (feathers, petals, paper, gold paper, porcelain shards, ink, glow feathers, embers, frost) + TRAIL_DROP |

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
| `fx.beam(from, to, { core, glow, wCore, wGlow, life, shrink, scroll, pattern, wStart, ramp })` → `{ set(from, to), stop() }` | lasers, rail shots, charge beams (Thunderbolt / Frost Viper style); `pattern: 'feather'` = a hot rachis + herringbone barbs scrolling down the shaft (M03 焚天光), `wStart` / `ramp` (m) = width fraction where it leaves the gun and the distance to full width (a fat shaft that stays thin at the muzzle, never a disc over the crosshair) |
| `fx.bolt(from, to, { col, glow, width, core, levels, jitter, branches, regen, life })` → `{ set, stop }` | lightning chains, arcs (JANUS / Gungnir style) |
| `fx.trail({ width, life, color, color1, taper, profile, vm })` → `t.push(a)` / `t.push(root, tip)` / `t.stop()` | projectile streaks; blade slash trails (push the blade root and tip every frame). `profile: 'crescent'` (X02): alpha on the outer half of the root→tip span, white-hot leading edge, feathered tail and cap — an energy arc instead of a filled sheet (push from mid-blade, not the root) |
| `fx.shockwave(pos, { normal, r0, r1, life, color, thin })` | ground rings, muzzle rings, impact shocks |
| `fx.sparkBurst(pos, { color, color1, count, speed, glow, normal })` | energy impacts |
| `fx.explosion(pos, { color })`, `fx.particles.spawn({ ramp: RAMP.green, … })` | coloured blasts and fire |

Weapon definitions can opt in without touching code: `def.fx = { ramp: RAMP.blue, flashScale: 1.2,
tracer: { color: [2, 3.5, 9], glow: [0.6, 1, 3], width: 0.03, length: 4 }, tracerEvery: 1 }` and
`def.suppressed = true` (gas puff, no tracer, tiny light). Special modes (`specials.js` modifiers) set
`flash: 'energy' | 'magma'`, `flashScale` and `tracer: [r, g, b]` — or a list of colours the split rounds cycle
through (雙相 overphase: cyan / amber, its hexagonal muzzle crown is `weapons/antical.js` phaseCrown).

Recipes (from 06b): Thunderbolt = `beam` (core [2.5,3.5,8], glow [0.6,0.5,2.2], wCore 0.02, wGlow 0.16, life 0.6,
shrink 0.4) + blue `sparkBurst` at the hit; JANUS lightning = `bolt` with col [6,3.6,0.6], glow [2.2,1,0.1],
width 0.22, levels 3, jitter 0.06; blade = `trail({ life: 0.14, color: [4,3.2,2.2,1], color1: element×1.5 })`
pushed with root/tip; Balrog charged shot = `muzzle(…, { ramp: RAMP.red })` + `explosion(hit, { scale: 0.35 })`.

## Premium FX kit (PREMIUM_WEAPONS §1.7.5 / §4.2 row 0.5)

Reusable components for premium weapons (summon 5 beats §1.7.3, L0–L4 levels §1.7.4, budgets §1.14). All
textures are generated procedurally at load (Canvas 2D or per-pixel JS, cached per page); every component takes
an optional `seed` so a networked skill event `{ id, seed, pos, dir }` replays identically on each client.
Colours are linear HDR `[r, g, b]` (also `'#hex'`, `THREE.Color`, `Vector3`); additive parts above 1 bloom.
`kit.js` installs the five objects on the facade (`fx.kit` holds them too); `fx.clear()` clears them all.
Data-driven clip / skill events can use the spec's component codes directly:
`fx.kit.play(code, opts)` with `TINT`, `RADIAL`, `TUNNEL`, `RIFT`, `CLOUDSEA`, `CURTAIN`, `INK`, `BORDER`, `BURN` /
`POISON` / `FROST` / `ELECTRIC`, `SIGIL`, `PILLAR`, `RING`, `GHOST`, `SHADOW`, `SWARM`, `WING`, `MOTE`, `TRAIL_DROP`
(options as the calls below; `dur` / `amt` / `pos` / `from` / `to` / `kind` / `parent` where relevant), e.g. the
Appendix A `overlay: { fx: 'TUNNEL', look: 'wave_pipe' }` → `fx.kit.play(o.fx, o)`.

### `fx.overlay` — full-screen overlays (`overlays.js`)

Drawn inside the HDR scene pass (they bloom and tonemap like the world). *Front* passes (mul + premultiplied add)
cover the viewmodel like CSO's 2D sprites; *back* passes (RADIAL, RIFT, CLOUDSEA, CURTAIN, TUNNEL) sit just behind
the gun's squeezed depth range, in front of the world. One ubershader per pass, all kinds gated by uniforms.

| Call | Effect |
|---|---|
| `status(kind, strength = 1, dur = 1.2, { color })` | CSO status overlays (06b §6.2 / §9.8): `'burn'` licking flames rising from the bottom + embers + warm frame, `'poison'` opaque lime blotches with drips and bubbles, `'frost'` rime + feathery crystals + crack front + glints, `'electric'` arcs crawling on the border re-dealt every 50 ms (`color`, default violet). Calling again refreshes (max strength, extended time) instead of stacking |
| `tint(color, alpha = 0.2, dur = 0.6)` | TINT: `col = mix(col, col·tint·1.6 + tint·0.05, α)`, α capped at 0.35 |
| `radial(amt = 1, dur = 0.35, { color, ink, r0, seed, density, thin })` | RADIAL speed lines from the centre (centre kept clean), re-dealt every 40 ms; `ink: true` = black lines; `density` (0.5 = half the 96 rays) and `thin` (line width ×, 1) for a lighter beat (X02: `{ r0: 0.3, density: 0.3, thin: 0.5 }`) |
| `ink(amt = 1, dur = Infinity)` | ink-wash filter (負屓 書寫): desaturate + exposure / contrast (renderer `post` deltas), rice-paper grain, ink bleeding in from the edges |
| `rift(dur = 1.2, { angle = 1.75, open = 1, seed })` | RIFT: rice-paper tear opening in 0.2 s (torn fibre lip, ink blooming inside) + ink speed lines |
| `cloudsea(dur = 4, { sun, seed })` | CLOUDSEA: three parallax billowy cloud banks rising over the lower screen, gold rims, sunrise sky (玉山 雲海日出) |
| `curtain(dur = 3, { color })` | CURTAIN (simple): velvet drapes slide in from the sides (≤ 24 % each) + scalloped valance, gold trim |
| `tunnel(dur = 2.5, { look, color, amt })` | TUNNEL around the camera: `'wave'` = 螭吻 wave pipe (220° curl over the top and right, helical foam lines, foaming lip flinging droplets every 0.4 s, centre 35 % open), `'lava'` = twin's molten pipe, `'rings'` = generic light / ice rings |
| `border(color, alpha = 0.25, dur = Infinity)` | BORDER: drives the composite's `post.edge` / `post.edgeColor` (as a delta, so `renderer.setEdge` users coexist); own edge glow if the renderer has none |
| `add(kind, opts)` | generic form; `opts`: `amt`, `dur`, `fadeIn`, `fadeOut` + the per-kind options above |

Every call returns a handle `{ stop(fade), set(opts), alive, level }`. `fx.overlay.scale` (0..1) is the settings
multiplier; `fx.overlay.active` lists live entries. Budgets: ≤ 4 live overlays (the weakest fades out), one L4
screen (TUNNEL / CLOUDSEA / RIFT / CURTAIN / ink) at a time (a new one replaces the old in 0.15 s), TINT α ≤ 0.35,
full-screen α ≤ 0.5, nothing in the central 20 %. Quality: **low** = cheap edge-only status variants, TUNNEL →
coloured BORDER, CLOUDSEA → gold tint, RIFT → short white tint, CURTAIN → dark red tint, RADIAL dropped;
**medium** drops RADIAL; **high / ultra** everything.

### `fx.sigils` — SIGIL, PILLAR, RING (`sigils.js`)

`SIGIL` designs (original, procedural Canvas 2D; pseudo seal glyphs come from a stroke grammar, not real
characters): `clouds` 雲紋, `seal` 篆印, `bagua` 八方陣, `censer` 香爐雲紋, `isobar` 等壓線, `mountainSea` 山海紋,
`nian` 剪紙「年」, `vortex` 漩渦水紋, `thunder` 雷紋, `flame` 火焰雲紋, `wind` 風紋, `square` 方陣 (no spin),
`starmap` 星圖 (28 mansion ticks with little constellation glyphs, a dipper inside; group 3, X02 天劍).
Each is a white mask in one channel of a 1024² RGBA texture (4 per texture, 4 textures, built lazily per group in
~0.1 s; 512² on low). Designs use three concentric bands that the shader spins independently (inner +35°/s,
outer −20°/s by default); a mip-biased second fetch gives the glow halo. `fx.sigils.preload(['censer'])` at
weapon equip avoids a first-use hitch; `fx.sigils.debugURL('seal')` returns a PNG of a design.

| Call | Effect |
|---|---|
| `sigil(pos, { design, radius = 6, color, color1, intensity, life = 2.6, grow = 0.25, spin, pulse, normal, face, lift, glow, seed })` → `{ mesh, stop(fade), set({ color, color1, intensity, spin }), alive }` | ground magic circle: appears scale 0.6 → 1 (easeOutBack) with a 0.15 s white flash, bands spin, pulses, fades out; `color` centre → `color1` rim; `normal` (default up, `'camera'` = upright billboard, e.g. M02's 「報」 seal); turned so its top faces away from `face` (default the camera) |
| `pillar(pos, { radius = 1.2, height = 14, color, color1, life = 0.8, strike = 0.08, square, rise, motes = 14, ring, light })` → `{ mesh, stop(), alive }` | light column: hot core + soft sheath (one draw), streaks racing up, ground flare, strike flash, rising glints, ground RING, one pooled light flash; `square: true` = M06 seal court; `rise: true` = grows up from the ground |
| `ring(pos, opts)` | RING: flat `fx.shockwave` on the ground |

Budget: ≤ 6 sigils alive (L2: 2 per player); the oldest fades early.

### `fx.summons` — GHOST, SHADOW, SWARM (`summons.js`)

| Call | Effect |
|---|---|
| `ghost({ shape \| mesh \| geometry, shapeOpts, pos, yaw \| quat, size, base, core, rim, edge, opacity, glaze, dark, rimPower, flowSpeed, appear = 0.35, life = 3, out = 0.5, motion, bob, flap, wave, exit, big, seed })` → `{ obj, t, alive, dissolveOut(dur), flash(k), lunge(target, dur), remove() }` | glazed porcelain spirit: depth pre-pass (only the front surface shows), fresnel rim (`rim`), glaze highlight following the scene sun, light veins drifting up the body (`core`), ground-up dissolve in (`appear`), extremities-first dissolve out (`out`) with a hot `edge`, then `exit: { kind, count, palette, color, speed }` motes thrown off the body surface (`kind: 'spray'` = water). `dark: true` = black silhouette + rim (金烏影). `motion: 'rise'` comes up out of the ground, `'hover'` bobs. Built-in `shape`s: `bird` (flapping; `shapeOpts.tail` 2.4 = magpie), `fish` (whale flukes, `wave.axis [0,1,0]`), `serpent` (water dragon, travelling `wave`), `bell`, `stele`, `orb`, `blade`; weapon spirits (lion, nian…) pass a GLB `mesh`. `big` (default when size > 3): one big spirit at a time, the previous dissolves (§1.7.3). A `geometry` may carry `aTint` (vec4 per vertex: glaze rgb + weight) for parts in their own colour on the one draw (M03 crane: vermilion beak, red crown, enamel feather plates, gold edges); without it the tint is zero |
| `shadow(pos, { height = 1.8, face, rise = 0.1, life = 1.6, slashes, every = 0.3, delay, glow, trailColor, seed })` → `{ obj, slash(), stop(), tip(out), alive }` | SHADOW: original shadow-puppet swordsman (five riveted leather plates — head, robe, sleeve, sword arm, rod; vermilion + ink with lace cut-outs, backlit, gold edges) propped up from the ground in 0.1 s, faces the camera, looks towards `face`, slashes with a blade trail, falls back and scatters paper scraps |
| `swarm({ shape = 'bird', shapeOpts, count = 12, center, radius, height, size, speed, …ghost colours, life, appear, trails, trailColor, flap, exit: { kind, color }, seed })` → `{ obj, center, dive(i, target, dur), diveAll(targets, every), exit(point?), stop(), alive }` | instanced flock (one draw + pre-pass): orbits `center` (Vector3 or function), banks into turns, `dive` swoops to a target and back dragging a TRAIL, `exit(point)` flies home one by one and dissolves (no point: dissolve in place with feather motes) |

### `fx.wings` — WING (`wings.js`)

| Call | Effect |
|---|---|
| `vm(opts)` → Wing | first-person fans on the current gun at `S_wingL` / `S_wingR` (fallback: receiver flanks, scale 0.7); detached automatically when the gun is swapped |
| `attach(parent, { vm, side, preset, anchors, count = 7, spacing = 15, sweep = 25, scale, style, shape, core, tip, enamel, gold, open, alpha, fan, guardMin })` → Wing | any Object3D; `preset: 'back'` (3P `S_back`, scale 3.2 ≈ 2.4 m span) or `'vm'`; `anchors { L, R }` local positions; `alpha` cloisonné enamel opacity (0.92; lower lets the world through the cells); `fan { L: { a, o }, R: { a, o } }` first-person fan directions in the parent frame (innermost card, opening direction), `guardMin` the centre guard's floor (0.35) |
| Wing: `openWing(dur = 0.25)`, `close(dur = 0.2)`, `set({ core, tip, gold, enamel, glow })`, `sparkle(n = 16)`, `detach()` | open = easeOutBack with a 20 ms stagger; `glow` 1.5 for the ready state; `sparkle` sheds light dust from the feather tips |

Cards: innermost 0.22×0.05 m, +12 % length per card, outermost ≈ 0.42×0.07 m, idle sway, light flowing out at
0.4 uv/s. Styles: `'glow'` additive (white root → `tip` colour) and `'cloisonne'` 掐絲琺瑯 (gold wire cells with
glowing `enamel` [c0, c1, c2], M03 畢方; `tipMix` 0..1 shades the cells to `tip` towards the feather tips: 鬼車's
violet-to-cold-teal wings, a charged state's white-hot edges). Quality: 3 / 5 / 7 cards per side (low / medium / high), same fan
angle. First person: a guard shrinks a side whose cards would enter the central 20 % or exceed 25 % of the screen.

### `fx.motes` — falling sprites + TRAIL_DROP (`motes.js`)

Kinds (`MOTE`): `feather`, `petal`, `paper` (red), `goldpaper` (金紙 with foil square), `shard` (porcelain: glaze
colour + white body on the broken edge, bounces), `ink` (drops, stain decal on landing), `splat`, `glowfeather`,
`ember`, `frost` — the last three emissive. Real 3D tumbling quads with falling-leaf sway, wind
(`fx.motes.wind`), landing (paper / feathers lie flat, then shrink away).

| Call | Effect |
|---|---|
| `spawn(kind, pos, { vel, color, color2, size, life, fall, gravity, emit, owner, seed })` | one mote |
| `burst(kind, pos, count, { speed, dir, spread, radius, palette, color, size, life, seed })` | burst (half count on low) |
| `trailDrop(from, to, kind, { owner, spacing = 2, scoped, max = 24, … })` → count | TRAIL_DROP (§1.17): one mote every 2 m along a bullet path / blade arc, ~1.2 s, ≤ 24 alive per `owner`, half density when `scoped` |

Pools: 300 / 150 / 60 motes (high / medium / low, §1.14) in two draw calls (lit alpha-tested with
alpha-to-coverage, emissive additive).

### Draw calls and programs

Live only while used: overlays 1–3 full-screen quads + tunnel 1; each sigil 1; each pillar 1; each ghost /
swarm 2 (depth pre-pass + colour); each shadow puppet 5 small plates; wings 1 per pair; motes 2. Every program is
created at match load (hidden prototypes) so the scene precompile covers it — no first-use shader hitch.

### QA recipes

`?w=akm&match=0`, then in `--eval`: `const fx = __cf.game.fx; __cf.stop();` and e.g.
`fx.overlay.status('poison', 1, 3)`, `fx.overlay.tunnel(2.5, { look: 'wave' })`,
`fx.sigils.sigil(p, { design: 'vortex', radius: 5, color: [0.5, 2, 3.2] })` + `fx.sigils.pillar(p, {...})` +
`fx.summons.ghost({ shape: 'serpent', pos: p, size: 8, motion: 'rise', exit: { kind: 'spray' } })`,
`fx.summons.swarm({ shapeOpts: { tail: 2.4 }, center: p })` then `.diveAll([...])`, `fx.summons.shadow(p, { slashes: 3 })`,
`fx.wings.vm({ style: 'cloisonne' })`, `fx.motes.burst('shard', p, 10)`, stepping with `__cf.step(n)` between
snapshots. Contact sheets: draw `document.querySelector('canvas')` into a 2D canvas right after each
`__cf.step()` (the drawing buffer is still valid in the same task). Review sheets of the kit:
`captures/fx/kit_*.png` (gitignored: `ov*` overlays, `sig0` raw sigil designs, `w1` sigils / pillars, `s2` summons,
`wg1` wings, `seq1` a full 5-beat summon, `lq1` low quality, `mq` motes close-up).

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
