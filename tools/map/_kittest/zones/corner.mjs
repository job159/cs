// Kit test zone: a 4-way street corner of a North-American industrial town.
// Streets 10 m wide along x and z; four blocks raised as sidewalk slabs; two full buildings (brick shop block
// with fire escape, clapboard house with gable roof), a corrugated garage, a fenced gravel lot with a
// container, vehicles (intact / wrecked / burnt / police / van / bus), street lights, utility poles with
// wires, a traffic signal, barricades, cones, debris, props and gameplay markers.
const S = 0.15; // sidewalk top

export function build(kit) {
  // ---------------------------------------------------------------- streets
  kit.ground([[-34, -5], [-5, -5], [-5, -34], [5, -34], [5, -5], [34, -5], [34, 5], [5, 5], [5, 34], [-5, 34], [-5, 5], [-34, 5]], { mat: 'asphalt' });
  kit.patch([[-22, -3.5], [-14, -3.2], [-13.5, 1.4], [-21, 1.0]], { mat: 'asphalt_patch' });
  kit.patch([[1.2, 12], [3.8, 12.4], [3.6, 19], [1.0, 18.6]], { mat: 'asphalt_patch' });
  kit.patch([[-3, -14], [2.5, -13.5], [2.2, -9], [-2.6, -9.5]], { mat: 'asphalt_patch' });
  // markings: double yellow centre lines, stop lines, crosswalks, edge lines
  for (const seg of [[[-34, 0], [-8.5, 0]], [[8.5, 0], [34, 0]]]) kit.markLine(seg, { mat: 'paint_yellow', double: 0.1, width: 0.1 });
  for (const seg of [[[0, -34], [0, -8.5]], [[0, 8.5], [0, 34]]]) kit.markLine(seg, { mat: 'paint_yellow', double: 0.1, width: 0.1 });
  kit.markLine([[-8.6, 0.2], [-8.6, 4.6]], { width: 0.4 });
  kit.markLine([[8.6, -0.2], [8.6, -4.6]], { width: 0.4 });
  kit.markLine([[0.2, -8.6], [4.6, -8.6]], { width: 0.4 });
  kit.markLine([[-0.2, 8.6], [-4.6, 8.6]], { width: 0.4 });
  kit.crosswalk({ at: [-7, 0], dir: 0, across: 9.6, length: 2.4 });
  kit.crosswalk({ at: [7, 0], dir: 0, across: 9.6, length: 2.4 });
  kit.crosswalk({ at: [0, -7], dir: Math.PI / 2, across: 9.6, length: 2.4 });
  kit.crosswalk({ at: [0, 7], dir: Math.PI / 2, across: 9.6, length: 2.4 });
  for (const seg of [[[-34, 4.6], [-9, 4.6]], [[9, -4.6], [34, -4.6]], [[-34, -4.6], [-9, -4.6]], [[9, 4.6], [34, 4.6]]]) kit.markLine(seg, { width: 0.1, dash: [3, 3] });
  kit.manhole([-2.2, -20]);
  kit.manhole([12, 1.8]);
  kit.drain([-5.15, 14], Math.PI / 2);
  kit.drain([12, -5.15], 0);

  // ---------------------------------------------------------------- blocks (raised slabs)
  kit.slab([[5, -34], [34, -34], [34, -5], [5, -5]], { mat: 'sidewalk', y1: S });
  kit.slab([[-34, 5], [-5, 5], [-5, 34], [-34, 34]], { mat: 'sidewalk', y1: S });
  kit.slab([[-34, -34], [-5, -34], [-5, -5], [-34, -5]], { mat: 'sidewalk', y1: S });
  kit.slab([[5, 5], [34, 5], [34, 34], [5, 34]], { mat: 'sidewalk', y1: S });
  // yards / lots on top of the slabs
  kit.ground([[-30, -30], [-9, -30], [-9, -10], [-30, -10]], { mat: 'gravel', y: S + 0.01 });
  kit.ground([[-30, 8.6], [-9, 8.6], [-9, 10.5], [-30, 10.5]], { mat: 'grass', y: S + 0.01 });
  kit.ground([[9, 9], [30, 9], [30, 30], [9, 30]], { mat: 'concrete_cracked', y: S + 0.01 });

  // ---------------------------------------------------------------- building 1: brick shop block (NE)
  const b1 = kit.at({ y: S }, () => kit.building({
    rect: { x: 18, z: -18, w: 18, d: 13 }, floors: 3, floorH: 3.1, groundH: 3.8, mat: 'brick_red',
    sides: [
      { ground: 'shop', awning: { tint: '#2f4f3a' }, sign: { lit: true }, fireEscape: 3 },
      { ground: 'windows', type: 'facade' },
      { type: 'blank' },
      { ground: 'shop', groundBays: ['shop', 'doors', 'shop', 'shop'], sign: { mat: 'sign_blue' } },
    ],
    windows: { ac: 0.15 }, enter: { ground: true },
  }));
  void b1;

  // ---------------------------------------------------------------- building 2: clapboard house with gable roof (SW)
  kit.at({ y: S }, () => kit.building({
    rect: { x: -19, z: 17.5, w: 14, d: 13 }, floors: 2, floorH: 2.9, groundH: 3.0, mat: 'wood_siding', tint: '#c9cfc8',
    plinth: { h: 0.6, mat: 'trim_concrete' }, belt: false, quoins: false, cornice: false,
    roof: { type: 'gable', pitch: 30, overhang: 0.5, mat: 'roof_shingles' },
    windows: { w: 0.95, h: 1.4, sill: 0.85, bay: 3.0, lintel: false, states: { glass: 0.3, dark: 0.3, broken: 0.2, boarded: 0.2 } },
    sides: [{ type: 'facade', ground: 'windows' }, { ground: 'windows', doorBay: 1 }, { ground: 'windows', doorBay: 2 }, { type: 'blank' }],
  }));
  // loading platform with stairs and a ramp (SE lot)
  kit.slab([[26, 9.5], [30, 9.5], [30, 13], [26, 13]], { y0: S, y1: S + 1.05, mat: 'concrete_floor', curb: 0, edge: 'concrete_wall' });
  kit.stairs({ at: [26 - 1.75, S, 11.2], rot: -Math.PI / 2, rise: 1.05, run: 1.75, width: 1.4, rail: true });
  kit.ramp({ from: [28, S, 17.5], to: [28, S + 1.05, 13], width: 2, mat: 'concrete_floor' });

  // ---------------------------------------------------------------- corrugated garage (SE)
  kit.at({ y: S + 0.01 }, () => kit.building({
    rect: { x: 22, z: 20, w: 14, d: 10 }, floors: 1, groundH: 4.6, mat: 'corrugated_rusty', plinth: { h: 0.3 }, belt: false, quoins: false,
    cornice: false, roof: { type: 'flat', parapet: 0.3, mat: 'roof_tar', coping: 'steel', clutter: false },
    sides: [{ type: 'blank' }, { type: 'blank' }, { ground: 'garage' }, { ground: 'doors' }],
  }));

  // ---------------------------------------------------------------- fenced gravel lot (NW)
  kit.fence([[-30, -10], [-30, -30], [-9, -30], [-9, -10], [-14, -10]], { kind: 'chainlink', h: 2.3, barbed: true, y: S });
  kit.fence([[-21, -10], [-30, -10]], { kind: 'chainlink', h: 2.3, barbed: true, y: S });
  kit.gate({ at: [-21, -10], rot: 0, w: 3.5, h: 2.1, open: -0.7, y: S });
  kit.container({ at: [-20, -24], rot: 0.08, size: 40, y: S + 0.01, tint: '#c45a3c' });
  kit.container({ at: [-25, -16], rot: Math.PI / 2, size: 20, y: S + 0.01, tint: '#3c6e8f', doors: 'open' });
  for (const [x, z] of [[-12, -27], [-11, -26.2], [-12.2, -25.4]]) kit.prop('Barrel_01', { at: [x, z], y: S + 0.01, rot: kit.rnd(0, 6) });
  kit.prop('barrel_03', { at: [-11.2, -24.6], y: S + 0.01 });
  kit.prop('wooden_crate_02', { at: [-15, -13], y: S + 0.01, rot: 0.3 });
  kit.prop('old_tyre', { at: [-17, -12.5], y: S + 0.01, rx: Math.PI / 2 - 0.1 });
  kit.rubblePile([-27, -27], { y: S + 0.01, r: 1.8 });

  // ---------------------------------------------------------------- vehicles
  kit.vehicle({ type: 'sedan', at: [-15, 2.6], rot: Math.PI, state: 'wrecked', color: '#2c4f63' });
  kit.vehicle({ type: 'sedan', at: [3, -16], rot: Math.PI / 2 + 0.25, state: 'burnt', tilt: 0.03 });
  kit.vehicle({ type: 'police', at: [-2.4, 18], rot: -Math.PI / 2 - 0.4 });
  kit.vehicle({ type: 'van', at: [17, 2.6], rot: Math.PI - 0.05, color: '#d3cfc6' });
  kit.vehicle({ type: 'pickup', at: [16, 13.2], rot: Math.PI / 2, y: S + 0.01, color: '#5e2a22' });
  kit.vehicle({ type: 'bus', at: [-24, -2.4], rot: 0.04, state: 'wrecked' });
  kit.vehicle({ type: 'truck', at: [2.6, 26], rot: Math.PI / 2 });

  // ---------------------------------------------------------------- street furniture
  kit.streetLight({ at: [6.3, -6.3], rot: Math.PI, y: S });
  kit.streetLight({ at: [-6.3, 6.3], rot: 0, y: S });
  kit.streetLight({ at: [-20, -6.2], rot: -Math.PI / 2, y: S, on: false });
  kit.streetLight({ at: [20, 6.2], rot: Math.PI / 2, y: S, flicker: 'buzz' });
  kit.trafficLight({ at: [6.4, 6.4], rot: Math.PI, y: S, state: 'amber' });
  const p1 = kit.utilityPole({ at: [-28, 6.6], y: S, transformer: true });
  const p2 = kit.utilityPole({ at: [-12, 6.6], y: S });
  const p3 = kit.utilityPole({ at: [12, -6.6], y: S, lean: 0.03 });
  kit.wires(p1, p2);
  kit.wires(p2, p3);
  kit.roadSign({ at: [-6.4, -6.4], rot: Math.PI / 4, y: S, shape: 'octagon' });
  kit.roadSign({ at: [6.6, 9.5], rot: -Math.PI / 2, y: S, shape: 'diamond', lean: 0.1 });
  kit.billboard({ at: [24, -30], rot: 0, y: S, w: 7, h: 3.2, elev: 5.5, lit: true });
  kit.waterTower({ at: [-26, 26], y: S, h: 12, r: 3.2 });
  kit.prop('fire_hydrant', { at: [-6.2, -9], y: S, rot: 1.2 });
  kit.prop('metal_trash_can', { at: [25.5, -8.6], y: S, rot: Math.PI });
  kit.prop('painted_wooden_bench', { at: [12, -6.4], y: S, rot: Math.PI });
  kit.prop('utility_box_02', { at: [6.3, -12], y: S, rot: -Math.PI / 2 });
  kit.trash([23, -8.5], { y: S });

  // ---------------------------------------------------------------- barricade line across street B (south)
  kit.jersey({ at: [-2.6, 11], rot: 0.05, stripes: true });
  kit.jersey({ at: [2.4, 11.3], rot: -0.12 });
  kit.sandbags([[-4.6, 13.2], [-0.8, 13.2]], { rows: 3 });
  kit.plankBarricade({ at: [1.8, 13.6], rot: 0.1 });
  kit.tape([[-4.8, 1.0, 9], [-1, 0.95, 9.2], [3, 1.0, 9.1], [4.8, 1.0, 9]]);
  for (const [x, z] of [[4, 9.5], [3.2, 10], [-4, 10.2]]) kit.cone([x, z]);
  kit.cone([1.5, 9.8], { fallen: true });
  kit.debris([-8, 1], { r: 2.5, count: 18 });
  kit.debris([10, -10], { r: 1.5, count: 10, y: S });

  // a burning barrel (realtime flickering light, not baked)
  kit.prop('Barrel_01', { at: [8.6, 8.8], y: S, collide: true });
  kit.light({ pos: [8.6, S + 1.4, 8.8], color: '#ff8a3a', intensity: 12, range: 9, flicker: 'fire', realtime: true, bake: false, name: 'fire_barrel' });

  // ---------------------------------------------------------------- gameplay markers
  kit.playerSpawn([0, 0.05, -1.5], 0);
  kit.playerSpawn([1.5, 0.05, -1.5], 0);
  kit.playerSpawn([-1.5, 0.05, -1.5], 0);
  kit.playerSpawn([0, 0.05, -3], 0);
  kit.buy([0, 0, 0], 4);
  kit.supply([4, S, -8]);
  kit.spawner({ pos: [-32, 0.05, 0], kind: 'street', lookAt: [0, 0] });
  kit.spawner({ pos: [32, 0.05, 0], kind: 'street', lookAt: [0, 0] });
  kit.spawner({ pos: [0, 0.05, -32], kind: 'street', lookAt: [0, 0] });
  kit.spawner({ pos: [0, 0.05, 32], kind: 'street', lookAt: [0, 0] });
  kit.spawner({ pos: [-14, S + 0.05, -12], kind: 'fence', lookAt: [0, 0] });
  kit.bossArena('mid', { center: [0, 0, 0], radius: 12 });
  kit.bossArena('final', { center: [0, 0, 0], radius: 14 });
  return {};
}
