# Weapon modelling guide (災厄前線 CALAMITY FRONT)

Every weapon is a procedural hard-surface model written in JavaScript with the kit in
`tools/assets/lib/gunkit.mjs`, baked (AO + edge wear + cavity) and exported to
`game/assets/weapons/<id>.glb`. Style target: **Counter-Strike 2 / PUBG realism** — real-world proportions,
believable machining, wear and materials. CSO-style "flashy" special weapons keep the same realistic
industrial craftsmanship (machined housings, cables, coils, glowing cores) rather than toy shapes.

## Workflow

```
node tools/assets/build-weapons.mjs <id>          # build one (≈20–60 s incl. bake), prints KB / tris
node tools/assets/build-weapons.mjs <id> --nobake # fast geometry-only iteration (~1 s)
# dev server must be running: node scripts/dev.mjs  (http://127.0.0.1:5190)
node tools/shot.mjs "http://127.0.0.1:5190/?view=weapon&id=<id>&grid=1" --w 1600 --h 900 --out captures/<id>_grid.png --wait 1500
node tools/shot.mjs "http://127.0.0.1:5190/?view=weapon&id=<id>&fp=1"   --w 1280 --h 720 --out captures/<id>_fp.png --wait 1500
node tools/shot.mjs "http://127.0.0.1:5190/?view=weapon&id=<id>&yaw=90&pitch=5&dist=0.6" --w 1280 --h 720 --out captures/<id>_side.png --wait 1500
```
Then **look at the PNGs** (Read tool) and iterate. `grid=1` shows right side / left side / front 3/4 /
rear-top 3/4. `fp=1` is a close rear-right-high view of the receiver: what the player stares at in first
person, so it must be the most detailed area. `yaw`, `pitch`, `dist` (m), `wear` (0..2) are free params.

## Coordinates (authoring)

All kit functions take **side-view millimetres**: `s` = forward (towards the muzzle), `t` = up,
`w` = right (ejection-port side). Three.js gun space is `(x = w, y = t, z = -s)`, the muzzle points down -Z.
Put `t = 0` on the bore axis. The origin along `s` is free (usually the rear of the receiver). Use real
dimensions (reference: overall length, barrel length, height, magazine size of the real archetype).

## Kit cheat-sheet (see the source for all options)

| function | use |
|---|---|
| `profile(pts \| 'M s t L ... Q ... C ... Z', { w, cw, bevel, bevelSeg, curveSeg, holes })` | side-view outline extruded across the gun (thickness `w`, centred at `cw`). `pts` = `[[s, t, filletRadius], ...]`. The workhorse for receivers, stocks, grips, magazines, triggers, guards |
| `plan(pts, { h, ct })` | top-view outline extruded vertically (levers, charging handles, flat sights) |
| `section(pts in (w,t), s0, s1, { bevel, holes })` | cross-section extruded along the barrel axis (rails, handguards, mag bodies end-on) |
| `lathe([[s, r], ...], { t, w, seg })` | revolve around an axis parallel to the bore (barrels, muzzle devices, scopes, suppressors, knobs) |
| `cyl(s0, s1, r, { t, w })`, `tube(s0, s1, ro, ri, ...)` | chamfered solid cylinder / hollow tube along the bore axis. **Always show a real bore at the muzzle** (`tube`) |
| `box([s,t,w], [ls,lt,lw], { r, rot })` | rounded box |
| `sphere`, `ring`, `sweep(points, r)` | balls, rings/swivels, cables/handles along a path |
| `rail(s0, s1, { t, w, side })` | Picatinny rail (teeth every 10 mm) |
| `screw([s,t,w], r, { face })` | screw / rivet / pin heads |
| `cut(geo, [cutters...])`, `union`, `intersect` | CSG (three-bvh-csg). `cutters.holeW/holeT/holeS/slotW/pocketW/box` |
| `xform(geo, { rot, pivot, move, scale })`, `mirrorW(geo)`, `merge([...])` | transforms |

Parts: `g.add(geo, mat)` adds to `body`. Moving parts are separate nodes: `const mag = g.part('mag', { pivot: [s,t,w], extras: {...} })`;
geometry is still authored in gun coordinates, the pivot becomes the node origin. Parts can be nested with `{ parent: 'body' }`.

Sculpted premium pieces (beasts, relief, wraps): `tools/assets/lib/sculpt.mjs` on top of gunkit — `loft` through rings of
`[s,t,w]` points, tapered tubes `ttube`, `petal` flame / leaf plates (`bend` separates the curl from the thickness axis),
design-space relief (`ribbonT` strokes, `fanT` plates, `thunderT` 雲雷紋 bands, `curlT` cloud curls) mapped onto a surface
with `mapTris` (`cylMap(R)` wraps them round a shaft), `helixCord` bindings, `brilliant` cut stones, `tessellateFat` for the
bake. Also: `scaleT` (one cast shield scale, 33 tris: rim, keel, free edge standing proud — lay rows of them through any
surface map for beast hides), `wireT` (cheap cloisonné / cast wire), `clipHalf` (split a plate into enamel fields),
`tooth` (curved tooth / grooved fang), `ftube` (fluted oval horn), `ellip`, `petal({ groove })` fluted flames,
`dome(c, n, r, h, seg)`. Keep one mesh (part × material) under 65 536 vertices so its index buffer stays 16-bit, and
raise the `mapTris` crease (50-55) on dense relief so chamfers shade with their tops (fewer split vertices).
First users: `staff.mjs` (X04); the X03 bow keeps its own copies.
Shader knobs added for the staff (any premium def can use them): `pvKey[key].shardStretch` ([x, y, z] cell density in rest
space, < 1 elongates the cells: snake-belly 斷紋 along a shaft), `pvKey[key].shardRough` (glaze roughness, default 0.17),
and `mat[key].cavMetal` (metalness of the cavity crust, e.g. 0.1 for verdigris in bronze recesses; default off).

Cast relief as a heightfield (masks, plaques, cartouches): `tools/assets/lib/hfield.mjs`. Write the face as a height
function `h(s, t)` (base taper + domes + `bump`s + ridges from `SegIndex` distances: `halfRound`, smoothstep bevels;
keep every profile C1 -- a crease in h jags the analytic normals), then `hfFace(loops, h, opts)` meshes the region
(outline + holes) with a 2:1-balanced adaptive quadtree + conforming Delaunay, lifts it, takes normals from h's gradient
(flat stays exactly flat: no smoothing wedges) and QEM-decimates it with meshoptimizer (`decimate: { error, normals, ao,
lattice }`: `ao` keeps vertices where the horizon occlusion changes, `lattice` locks a vertex grid so no triangle fans
across a flat). `sheet()` lays a thin plate on h (gold leaf, enamel floors), `mirror()` is the normal-correct mirror
(gunkit `mirrorW` flips normal.x twice), `horizonAO(h, s, t)` feeds a post-bake patina pass. First user: `greataxe.mjs`.

## Required parts (node names) — only those the mechanism has

| part | meaning / animation contract |
|---|---|
| `body` | everything static |
| `mag` | detachable magazine. Pivot at the top of the mag where it seats in the magwell. Extras `{ drop: true }` |
| `bolt` | charging handle and/or visible bolt carrier; slides **backward (+z in three space)** by `extras.travel` metres |
| `slide` | pistol slide; slides back by `extras.travel` |
| `trigger` | pivot at the trigger pin; rotates about the w axis |
| `hammer` | pivot at hammer pin |
| `cylinder` | revolver cylinder; pivot on its axis; rotates about the bore-parallel axis. Optional `crane` part (swing-out) |
| `pump` | shotgun forend; slides back by `extras.travel` |
| `breech` | break-action barrels; pivot at the hinge pin, rotate down |
| `barrels` | rotating gatling cluster; pivot on the rotation axis |
| `cover` | MG feed cover; pivot at the hinge |
| `belt`, `drum`, `shell` | visible ammo pieces that animate during reload |
| `selector`, `leaf`, `latch`... | optional small parts |
| `fx_*` | special-weapon moving/glowing pieces (rings, blades, fins, coils). Document the intended motion in `extras` (e.g. `{ spin: 'z', speed: 8 }`, `{ open: [dx,dy,dz] }`) |

## Required sockets (`g.socket(name, [s,t,w], extra)`)

| socket | where |
|---|---|
| `muzzle` | exit point of the bore at the muzzle device |
| `eject` | ejection port centre (if casings are ejected); `{ dir: [s,t,w] }` = ejection direction |
| `grip_r` | **centre of the right palm** on the pistol grip / wrist; `rot: [0, 0, -tiltDeg]` where tilt = grip rake back from vertical (AK ≈ 18°, AR ≈ 20°, Glock ≈ 22°) |
| `grip_l` | centre of the left (support) palm: handguard, foregrip, pump or (pistols) under the right hand |
| `magwell` | where the left hand grabs the magazine during reload (≈ mag body just below the receiver) |
| `charge` | charging handle / bolt handle knob / slide serrations (left hand or right hand racks it) |
| `sight_rear`, `sight_front` | iron-sight notch and front-post tip (the aim line) |
| `optic` | centre of a red-dot / holo window or scope eyepiece (if mounted). `{ type: 'reddot' \| 'holo' \| 'scope', zoom }` |

Meta (`g.meta({...})`): `grip` (`pistol` | `rifle` | `bullpup` | `mg` | `heavy` | `melee` | `bow`),
`support` (`handguard` | `vertical` | `angled` | `pump` | `pistol_cup` | `top_handle` | `none`),
`reload` (`mag` | `mag_curved` | `mag_pistol` | `shell_tube` | `shell_break` | `cylinder` | `belt` | `drum` | `battery` | `bolt_single` | `tank` | `none`),
`chargeSide` (`right` | `left` | `top` | `rear`), `notes` (anything the animator should know).

## Materials (keys in `game/src/gfx/materials.js` → `MATS`)

`steel steel_dark steel_bright steel_blued alu alu_tan polymer polymer_tan polymer_od polymer_grip rubber wood wood_light
bakelite bakelite_plum brass copper chrome gold carbon fabric fabric_black paint_od paint_red paint_yellow paint_white
ceramic bone glass lens leather` and emissive `glow_cyan glow_blue glow_red glow_orange glow_purple glow_green glow_gold
glow_white reticle_red reticle_green tritium`.
Think like a real manufacturer: receivers in `steel`/`alu`, furniture in `polymer`/`wood`, bolts `steel_bright`,
springs/pins `steel_dark`, lenses `lens`, reticle dots `reticle_red`. Do not add new keys in your own file — if a material
is missing, list it in your report.

## Quality bar (must pass all)

1. **Silhouette**: instantly recognisable archetype from the side (e.g. AK, M4, MP5, AWP, M249, Deagle, M870, Kar98k).
   Proportions from real dimensions, not guessed.
2. **First-person detail**: receiver top, rear sight, charging handle, ejection port, right side, rails/handguard
   near the hands are richly detailed: screws, pins, seams, rivets, lightening cuts, serrations, stamped markings
   (raised/recessed panels), knurling areas (`polymer_grip`, `rubber`).
3. **Bevels everywhere**: no razor edges; bevel 0.5–2 mm on machined parts, 2–5 mm on furniture. Edge wear comes from bevels.
4. **Separate parts** where a real gun has seams; small gaps between parts (0.3–1 mm) read as realism.
5. **Real bore** at the muzzle, real ejection port opening, magazines with feed lips and visible top cartridge.
6. Budget: ≤ 45k triangles before tessellation (the build prints the post-tessellation count; ≤ 160k is fine), GLB ≤ 5 MB.
7. Original names only for brand-like markings (no real manufacturer logos, no CSO/Nexon names or signature shapes).
8. Check every view (grid, fp, side) and fix: floating parts, z-fighting, wrong winding (black/inside-out faces),
   holes that don't cut through, parts poking through others, pivots in the wrong place.

The AKM in `tools/assets/weapons/akm.mjs` is the first reference (still rough: its grip, front sight block and stock
need refining — improve on it, don't copy its weak spots).
