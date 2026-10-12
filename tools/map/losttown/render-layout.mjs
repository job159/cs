// Top-down blockout of 失落之城 LOST TOWN from layout.mjs -> captures/losttown_layout.svg (+ .png via tools/shot.mjs).
//   node tools/map/losttown/render-layout.mjs [--svg-only] [--scale 6]
// North is up (-Z), east right (+X). Everything drawn here comes straight from the layout data, so the picture is a
// check of the data, not a separate drawing.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from './layout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
// --focus cx,cz,half renders a close-up (e.g. --focus 0,0,24 --scale 22) to captures/losttown_layout_focus.png
const fi = args.indexOf('--focus'), focus = fi >= 0 ? args[fi + 1].split(',').map(Number) : null;
const S = +(args.includes('--scale') ? args[args.indexOf('--scale') + 1] : 0) || (focus ? 22 : 6); // px per metre
const [X0, X1, Z0, Z1] = focus ? [focus[0] - focus[2], focus[0] + focus[2], focus[1] - focus[2], focus[1] + focus[2]] : [-92, 92, -92, 92];
const M = 36, LEG = 380;
const W = Math.round((X1 - X0) * S + 2 * M + LEG), Hpx = Math.round((Z1 - Z0) * S + 2 * M);
const px = (x) => +((x - X0) * S + M).toFixed(1), pz = (z) => +((z - Z0) * S + M).toFixed(1);
const pts = (poly) => poly.map(([x, z]) => `${px(x)},${pz(z)}`).join(' ');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const out = [];
const add = (s) => out.push(s);
const text = (x, z, t, o = {}) => add(`<text x="${px(x)}" y="${pz(z)}" font-size="${o.size || 10}" fill="${o.fill || '#ddd'}" text-anchor="${o.anchor || 'middle'}" font-weight="${o.bold ? 700 : 400}"${o.rot ? ` transform="rotate(${o.rot} ${px(x)} ${pz(z)})"` : ''}${o.stroke ? ' stroke="#000" stroke-width="2.6" paint-order="stroke"' : ''}>${esc(t)}</text>`);
const poly = (p, fill, o = {}) => add(`<polygon points="${pts(p)}" fill="${fill}" stroke="${o.stroke || 'none'}" stroke-width="${o.sw || 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op !== undefined ? ` fill-opacity="${o.op}"` : ''}/>`);
const line = (a, b, col, o = {}) => add(`<line x1="${px(a[0])}" y1="${pz(a[1])}" x2="${px(b[0])}" y2="${pz(b[1])}" stroke="${col}" stroke-width="${o.w || 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op ? ` stroke-opacity="${o.op}"` : ''}/>`);
const circle = (x, z, r, o = {}) => add(`<circle cx="${px(x)}" cy="${pz(z)}" r="${o.pxr ? r : r * S}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.w || 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op !== undefined ? ` fill-opacity="${o.op}"` : ''}/>`);
const boxPoly = (b) => L.boxCorners(b);
const rectIntersect = (a, b) => { const x0 = Math.max(a[0][0], b[0]), z0 = Math.max(a[0][1], b[1]), x1 = Math.min(a[2][0], b[2]), z1 = Math.min(a[2][1], b[3]); return x1 > x0 && z1 > z0 ? L.rect(x0, z0, x1, z1) : null; };

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hpx}" viewBox="0 0 ${W} ${Hpx}" font-family="Microsoft JhengHei, Noto Sans TC, Segoe UI, sans-serif">`);
add(`<rect width="${W}" height="${Hpx}" fill="#161815"/>`);
add(`<clipPath id="mapclip"><rect x="${M}" y="${M}" width="${(X1 - X0) * S}" height="${(Z1 - Z0) * S}"/></clipPath><g clip-path="url(#mapclip)">`);
add('<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#b33" stroke-width="2" stroke-opacity="0.55"/></pattern>'
  + '<marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#ddd"/></marker></defs>');

// --- build zones (faint fills) --------------------------------------------------------------------------------
const ZC = { center: '#3b5c7a', north: '#5c4a7a', west: '#7a5a3b', east: '#3b7a5a', south: '#7a3b4f' };
for (const z of L.BUILD_ZONES) if (Array.isArray(z.polygon)) poly(z.polygon, ZC[z.id], { op: 0.16 });

// --- grid --------------------------------------------------------------------------------------------------------
for (let v = -90; v <= 90; v += focus ? 2 : 10) {
  line([v, Z0], [v, Z1], '#2b2e2a', { w: v % 50 === 0 ? 1.2 : 0.6 });
  line([X0, v], [X1, v], '#2b2e2a', { w: v % 50 === 0 ? 1.2 : 0.6 });
  if (v % (focus ? 4 : 20) === 0) { text(v, Z0 + 2.2 * 6 / S, `x${v}`, { size: 9, fill: '#6d726a' }); text(X0 + 3.5 * 6 / S, v + 0.6 * 6 / S, `z${v}`, { size: 9, fill: '#6d726a' }); }
}

// --- backdrop masses -------------------------------------------------------------------------------------------
for (const b of L.BACKDROP) for (const pp of b.polys || (b.poly ? [b.poly] : [])) poly(pp, '#262825', { stroke: '#333631' });

// --- streets: sidewalk (row) then carriageway ------------------------------------------------------------------
for (const s of L.STREETS) poly(s.row, '#77756c');
// intersection octagon (chamfer plazas) as sidewalk
poly([[-15, -9], [-9, -15], [9, -15], [15, -9], [15, 9], [8, 16], [-8, 16], [-15, 9]], '#77756c');
for (const s of L.STREETS) {
  const c = L.CURBS[s.id]; if (!c) continue;
  const [x0, z0] = s.row[0], [x1, z1] = s.row[2];
  const cw = c.x ? L.rect(c.x[0], z0, c.x[1], z1) : L.rect(x0, c.z[0], x1, c.z[1]);
  poly(cw, '#45464a');
}
poly(L.rect(-5.5, -9, 5.5, 9), '#45464a'); poly(L.rect(-9, -5.5, 9, 5.5), '#45464a');
for (const r of L.CURBS.returns) { const [cx, cz] = r.center; const corner = [Math.sign(cx) * 5.5 * (Math.abs(cx) > 8.2 ? 1 : 5 / 5.5), Math.sign(cz) * 5.5]; poly([corner, ...r.pts], '#45464a'); }
// crosswalks
for (const cw of L.SURFACES.find((s) => s.id === 'CROSSWALKS').polys) {
  const [x0, z0] = cw[0], [x1, z1] = cw[2];
  const alongX = x1 - x0 > z1 - z0;
  if (alongX) for (let x = x0 + 0.25; x < x1 - 0.2; x += 1) poly(L.rect(x, z0, x + 0.5, z1), '#cfcfc6', { op: 0.75 });
  else for (let z = z0 + 0.25; z < z1 - 0.2; z += 1) poly(L.rect(x0, z, x1, z + 0.5), '#cfcfc6', { op: 0.75 });
}
// centre lines
for (const s of L.STREETS) if (s.centerline && L.CURBS[s.id]) line(s.centerline[0], s.centerline[1], '#d8d8cc', { w: 0.8, dash: '6 10', op: 0.5 });
// spawn pockets
for (const s of L.STREETS) for (const p of [s.pocket, ...(s.pockets || [])].filter(Boolean)) poly(p, 'url(#hatch)', { stroke: '#b33', sw: 1 });

// --- buildings -------------------------------------------------------------------------------------------------
const FC = { limestone_grand: '#a7a191', brick_commercial: '#8a4a36', brick_dark: '#5b3a2d', stone_office: '#9c907a', painted_brick: '#8f9a84', industrial_brick: '#7b4532', diner_lowrise: '#b9b0a0' };
for (const b of L.BUILDINGS) {
  poly(b.footprint, FC[b.facade] || '#777', { stroke: '#111', sw: 1.2 });
  if (b.interior) poly(b.interior.poly, '#e8d9a0', { op: 0.35, stroke: '#ffe680', sw: 1.4, dash: '4 3' });
  const cx = b.footprint.reduce((a, p) => a + p[0], 0) / b.footprint.length, cz = b.footprint.reduce((a, p) => a + p[1], 0) / b.footprint.length;
  text(cx, cz - 0.6, b.id, { size: 10, bold: true, fill: '#fff', stroke: true });
  text(cx, cz + 2.0, `${b.floors.length}F ${b.height.toFixed(1)}m`, { size: 9, fill: '#f2f2f2', stroke: true });
  for (const o of b.openings || []) {
    if (o.state !== 'spawn' && o.state !== 'enterable') continue;
    const col = o.state === 'spawn' ? '#ff4a4a' : '#ffe680';
    if (o.face === 'C') { const [a, c] = b.chamfer; const p0 = [a[0] + (c[0] - a[0]) * o.along[0], a[1] + (c[1] - a[1]) * o.along[0]], p1 = [a[0] + (c[0] - a[0]) * o.along[1], a[1] + (c[1] - a[1]) * o.along[1]]; line(p0, p1, col, { w: 3.5 }); continue; }
    const xs = b.footprint.map((p) => p[0]), zs = b.footprint.map((p) => p[1]);
    const f = { N: Math.min(...zs), S: Math.max(...zs), W: Math.min(...xs), E: Math.max(...xs) }[o.face];
    if (o.face === 'N' || o.face === 'S') line([o.along[0], f], [o.along[1], f], col, { w: 3.5 }); else line([f, o.along[0]], [f, o.along[1]], col, { w: 3.5 });
  }
  if (b.fireEscape) {
    const fe = b.fireEscape, xs = b.footprint.map((p) => p[0]), zs = b.footprint.map((p) => p[1]);
    const f = { N: Math.min(...zs), S: Math.max(...zs), W: Math.min(...xs), E: Math.max(...xs) }[fe.face];
    const off = { N: -0.7, S: 0.7, W: -0.7, E: 0.7 }[fe.face];
    if (fe.face === 'N' || fe.face === 'S') poly(L.rect(fe.along[0], Math.min(f, f + off * 2), fe.along[1], Math.max(f, f + off * 2)), '#111', { stroke: '#999', sw: 0.8 });
    else poly(L.rect(Math.min(f, f + off * 2), fe.along[0], Math.max(f, f + off * 2), fe.along[1]), '#111', { stroke: '#999', sw: 0.8 });
  }
}

// --- landmarks -------------------------------------------------------------------------------------------------
const LM = L.LANDMARKS;
// bridge
poly(L.rect(LM.bridge.span[0], LM.bridge.z[0], LM.bridge.span[1], LM.bridge.z[1]), '#5d6a64', { op: 0.75, stroke: '#9fb3a9', sw: 1.5 });
for (const a of LM.bridge.abutments) poly(a, '#3a3f3c', { stroke: '#9fb3a9' });
text(0, -67.2, 'RAIL BRIDGE  deck 5.2-7.8 m', { size: 10, fill: '#e3efe8', stroke: true });
text(0, -60.4, '“LOST TOWN” letter boards (y 7.8-10)', { size: 10, fill: '#ffe08a', bold: true, stroke: true });
for (const part of LM.bridge.barricade.parts) poly(boxPoly(part), part.kind === 'container20' ? '#d9d6cc' : '#9a7a4a', { stroke: '#222' });
// LED gantry
for (const part of LM.ledGantry.barricade.parts) poly(boxPoly(part), part.kind === 'container20' ? '#6f7466' : '#9a7a4a', { stroke: '#222' });
line([LM.ledGantry.x, -8.6], [LM.ledGantry.x, 8.6], '#ffae2e', { w: 4 });
for (const p of LM.ledGantry.posts) poly(L.rect(p[0] - 0.6, p[1] - 0.6, p[0] + 0.6, p[1] + 0.6), '#c98a20');
text(-69.5, -10.8, 'LED “LEAVE TOWN NOW!!”', { size: 10, fill: '#ffae2e', bold: true, stroke: true });
// truck barricade
for (const part of LM.truckBarricade.parts) poly(boxPoly(part), part.kind === 'box_truck' ? '#e6e6e0' : '#9a7a4a', { stroke: '#222' });
// fort
const fort = LM.fort;
poly(fort.deck.poly, '#c9bf9c', { stroke: '#000', sw: 1.5 });
for (const c of fort.containers) poly(c.poly, c.color, { stroke: '#2a261c', sw: 1.4 });
for (const n of fort.notches) poly(n.poly, '#9a7a4a', { stroke: '#2a261c', sw: 1 });
poly(fort.core.poly, '#8f8f88', { stroke: '#4b4535' });
for (const r of fort.ramps) {
  poly(r.poly, '#3d4246', { stroke: '#a7b0b5', sw: 1 });
  line(r.top, r.foot, '#ddd', { w: 1.4 }); add(`<line x1="${px(r.top[0])}" y1="${pz(r.top[1])}" x2="${px(r.foot[0])}" y2="${pz(r.foot[1])}" stroke="#ddd" stroke-width="1.4" marker-end="url(#arr)"/>`);
}
for (const sb of fort.roofCover) poly(sb.poly, '#a08f63', { stroke: '#3a3220' });
for (const h of fort.hatches) poly(boxPoly({ x: h.pos[0], z: h.pos[1], w: h.size[0], d: h.size[1], rot: fort.rot }), '#5f6c5f', { stroke: '#ffd34d', sw: 1.2 });
text(0, 0.4, 'FORT', { size: 11, bold: true, fill: '#222' });
// signal masts
for (const p of LM.signalMasts.poles) { line(p.base, p.armTo, '#e2c34a', { w: 2 }); circle(p.base[0], p.base[1], 3, { pxr: true, fill: '#e2c34a' }); }

// --- props ------------------------------------------------------------------------------------------------------
const PC = (k) => /truck|bus|car|taxi|van|police/.test(k) ? '#c4793b' : /container/.test(k) ? '#5f6b5a' : /crate|pallet/.test(k) ? '#9a7a4a' : /fence|sawhorse|rubble/.test(k) ? '#888' : '#b8b8b0';
for (const p of L.PROPS) poly(boxPoly(p), PC(p.kind), { stroke: '#111', sw: 0.6, op: p.h < 0.05 ? 0.4 : 1 });
for (const l of L.STREET_LAMPS) circle(l.x, l.z, 2.2, { pxr: true, fill: l.state === 'dead' ? '#555' : '#ffcf7a' });
for (const m of L.MANHOLES) circle(m.x, m.z, 0.45, { fill: '#222', stroke: m.spawner ? '#ff4a4a' : '#999', w: 1.2 });

// --- blockers ----------------------------------------------------------------------------------------------------
for (const b of L.BLOCKERS) if (b.box) poly(boxPoly(b.box), 'none', { stroke: '#ff4fd8', sw: 1, dash: '3 2' });

// --- gameplay overlays -------------------------------------------------------------------------------------------
// sightlines from the fort roof
for (const [a, b, label] of [[[0, -9], [0, -62], 'N 62 m'], [[-9, 0], [-68.6, 0], 'W 69 m'], [[9, 0], [66, 0], 'E 66 m'], [[0, 9], [0, 68], 'S 68 m']]) {
  line(a, b, '#7fd3ff', { w: 1, dash: '2 5', op: 0.7 });
  text((a[0] + b[0]) / 2 + (a[0] === 0 ? 2.5 : 0), (a[1] + b[1]) / 2 + (a[1] === 0 ? -1.2 : 0), label, { size: 9, fill: '#7fd3ff', anchor: 'start', stroke: true });
}
// boss arenas
const ar = L.BOSS_ARENAS;
circle(ar.mid.center[0], ar.mid.center[2], ar.mid.radius, { stroke: '#ff9a3c', w: 2, dash: '10 6' });
circle(ar.final.center[0], ar.final.center[2], ar.final.radius, { stroke: '#c77dff', w: 2, dash: '14 6' });
circle(ar.mid.center[0], ar.mid.center[2], 1.0, { fill: '#ff9a3c' });
circle(ar.final.center[0], ar.final.center[2], 1.8, { fill: '#c77dff' });
text(ar.mid.center[0] + 2.5, ar.mid.center[2] + 0.5, 'MID BOSS entry (butcher)', { size: 10, fill: '#ff9a3c', anchor: 'start', bold: true, stroke: true });
text(ar.final.center[0] - 2.5, ar.final.center[2] - 2.2, 'FINAL BOSS landing (colossus)', { size: 10, fill: '#c77dff', anchor: 'end', bold: true, stroke: true });
// buy zone
for (const b of L.BUY) circle(b[0], b[2], b[3], { stroke: '#4ff0ff', w: 1.6, dash: '5 4' });
// supply
for (const s of L.SUPPLY) { poly(L.rect(s.pos[0] - 0.6, s.pos[2] - 0.6, s.pos[0] + 0.6, s.pos[2] + 0.6), '#ffd34d', { stroke: '#000', sw: 0.8 }); }
// player spawns
for (const p of L.PLAYER_SPAWNS) {
  const [x, , z, yaw] = p; const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  circle(x, z, 0.35, { fill: '#5dff6a', stroke: '#000' });
  line([x, z], [x + fx * 1.1, z + fz * 1.1], '#5dff6a', { w: 1.6 });
}
// spawners
const KC = { street: '#ff3b3b', gate: '#ff6a2a', fence: '#ff8f2a', manhole: '#c03bff', alley: '#ff3b9d', window: '#ff5f5f', roof: '#ff9fd0' };
for (const s of L.SPAWNERS) {
  const [x, , z] = s.pos; const fx = -Math.sin(s.facing), fz = -Math.cos(s.facing);
  const tip = [x + fx * 2.2, z + fz * 2.2], l = [x - fz * 0.9, z + fx * 0.9], r = [x + fz * 0.9, z - fx * 0.9];
  poly([tip, l, r], KC[s.kind] || '#f33', { stroke: '#000', sw: 0.8 });
  if (s.exit) line([x, z], [s.exit[0], s.exit[2]], KC[s.kind] || '#f33', { w: 0.8, dash: '2 2' });
  text(x, z - 1.6, s.id.replace('SP_', ''), { size: 8, fill: '#ffb3b3', stroke: true });
}
// lights
for (const l of L.LIGHTS) if (l.pos) { const c = l.realtime ? '#fff27a' : '#a89b4a'; circle(l.pos[0], l.pos[2], l.realtime ? 4.5 : 3, { pxr: true, fill: c, stroke: '#000' }); if (l.realtime) text(l.pos[0], l.pos[2] + 2.4, l.id, { size: 8, fill: c, stroke: true }); }

// --- build zone borders + labels ------------------------------------------------------------------------------------
for (const z of L.BUILD_ZONES) if (Array.isArray(z.polygon)) poly(z.polygon, 'none', { stroke: '#f5f5f5', sw: 2, dash: '12 6' });
const ZL = { center: [-25, -27.6], north: [-25, -79], west: [-83, -41.4], east: [27, -41.4], south: [-37, 82.6] };
for (const z of L.BUILD_ZONES) if (ZL[z.id]) text(ZL[z.id][0], ZL[z.id][1], `ZONE ${z.id.toUpperCase()}  ${z.name}`, { size: 12, bold: true, fill: '#ffffff', anchor: 'start', stroke: true });
text(-62, 89.6, 'ZONE SKYLINE = everything outside the dashed zones (block interiors, outer ring, towers, sky)', { size: 11, fill: '#bbb', anchor: 'start', stroke: true });
// street names
for (const [x, z, t, rot] of [[-2.5, -40, '北大道 NORTH AVE', -90], [-34, -1.6, '西街 WEST ST', 0], [32, 1.4, '東街 EAST ST', 0], [-2.2, 30, '南大道 SOUTH AVE', -90], [-60.6, -5, '西橫街', -90], [59.6, -10, '東橫街', -90], [-18, 52.6, '南橫街 SOUTH CROSS', 0], [0, 64, '南巷', 0]]) text(x, z, t, { size: 11, fill: '#e9e3c8', rot, bold: true, stroke: true });

add('</g>');
// --- legend --------------------------------------------------------------------------------------------------------
const lx = (X1 - X0) * S + 2 * M + 10; let ly = M + 8;
const leg = (t, o = {}) => { add(`<text x="${lx}" y="${ly}" font-size="${o.size || 12}" fill="${o.fill || '#ddd'}" font-weight="${o.bold ? 700 : 400}">${esc(t)}</text>`); ly += o.gap || 17; };
leg('失落之城 LOST TOWN — blockout', { size: 18, bold: true, fill: '#fff', gap: 22 });
leg(`map ${L.META.size[0]} x ${L.META.size[1]} m · grid 10 m · N up`, { fill: '#aaa' });
leg(`inspired by CSO Zombie Scenario S1 "Lost City"`, { fill: '#aaa', gap: 26 });
const swatch = (col, t, shape = 'rect') => { if (shape === 'rect') add(`<rect x="${lx}" y="${ly - 10}" width="14" height="11" fill="${col}" stroke="#000"/>`); else add(`<circle cx="${lx + 7}" cy="${ly - 5}" r="5" fill="${col}" stroke="#000"/>`); add(`<text x="${lx + 22}" y="${ly}" font-size="12" fill="#ddd">${esc(t)}</text>`); ly += 17; };
swatch('#45464a', 'carriageway (asphalt, y 0)'); swatch('#77756c', 'sidewalk / plaza (y 0.15)'); swatch('url(#hatch)', 'zombie spawn pocket (behind barricade)');
swatch('#c9bf9c', 'container fort deck y 2.59 (spawn + buy)'); swatch('#3d4246', 'perforated ramp (arrow = downhill)');
for (const [k, c] of Object.entries(FC)) swatch(c, `facade: ${k}`);
swatch('#e8d9a0', 'enterable interior (dashed)'); swatch('#c4793b', 'vehicle'); swatch('#9a7a4a', 'crates / pallets'); swatch('#5f6b5a', 'container');
for (const [k, c] of Object.entries(KC)) swatch(c, `spawner: ${k}`);
swatch('#5dff6a', 'player spawn (fort roof)', 'circle'); swatch('#ffd34d', 'supply point'); swatch('#fff27a', 'realtime light (6)', 'circle'); swatch('#ffcf7a', 'street lamp', 'circle');
add(`<line x1="${lx}" y1="${ly - 5}" x2="${lx + 14}" y2="${ly - 5}" stroke="#ff4fd8" stroke-dasharray="3 2"/><text x="${lx + 22}" y="${ly}" font-size="12" fill="#ddd">player clip</text>`); ly += 17;
add(`<line x1="${lx}" y1="${ly - 5}" x2="${lx + 14}" y2="${ly - 5}" stroke="#4ff0ff" stroke-dasharray="5 4"/><text x="${lx + 22}" y="${ly}" font-size="12" fill="#ddd">buy zone r ${L.BUY[0][3]}</text>`); ly += 17;
add(`<line x1="${lx}" y1="${ly - 5}" x2="${lx + 14}" y2="${ly - 5}" stroke="#ff9a3c" stroke-width="2" stroke-dasharray="6 3"/><text x="${lx + 22}" y="${ly}" font-size="12" fill="#ddd">mid-boss arena r ${ar.mid.radius}</text>`); ly += 17;
add(`<line x1="${lx}" y1="${ly - 5}" x2="${lx + 14}" y2="${ly - 5}" stroke="#c77dff" stroke-width="2" stroke-dasharray="6 3"/><text x="${lx + 22}" y="${ly}" font-size="12" fill="#ddd">final-boss arena r ${ar.final.radius}</text>`); ly += 17;
add(`<line x1="${lx}" y1="${ly - 5}" x2="${lx + 14}" y2="${ly - 5}" stroke="#7fd3ff" stroke-dasharray="2 4"/><text x="${lx + 22}" y="${ly}" font-size="12" fill="#ddd">sightline from the fort</text>`); ly += 17;
add(`<line x1="${lx}" y1="${ly - 5}" x2="${lx + 14}" y2="${ly - 5}" stroke="#fff" stroke-width="2" stroke-dasharray="8 4"/><text x="${lx + 22}" y="${ly}" font-size="12" fill="#ddd">build zone border</text>`); ly += 24;
const { errs, warns } = L.validate();
leg(`validate(): ${errs.length} errors, ${warns.length} warnings`, { fill: errs.length ? '#ff6b6b' : '#7dff8a', bold: true });
leg(`${L.BUILDINGS.length} buildings · ${L.PROPS.length} props · ${L.SPAWNERS.length} spawners · ${L.SUPPLY.length} supply`, { fill: '#aaa' });
// scale bar + north arrow
line([X0 + 4, Z1 - 4], [X0 + 24, Z1 - 4], '#fff', { w: 3 }); text(X0 + 14, Z1 - 5.5, '20 m', { size: 11, fill: '#fff' });
add(`<path d="M ${px(X1 - 6)} ${pz(Z1 - 14)} l -7 16 l 7 -5 l 7 5 z" fill="#fff"/>`); text(X1 - 6, Z1 - 15.5, 'N', { size: 13, bold: true, fill: '#fff' });
add('</svg>');

const svgPath = path.join(root, 'captures', focus ? 'losttown_layout_focus.svg' : 'losttown_layout.svg');
fs.mkdirSync(path.dirname(svgPath), { recursive: true });
fs.writeFileSync(svgPath, out.join('\n'));
console.log('wrote', svgPath, `${W}x${Hpx}`);
if (!args.includes('--svg-only')) {
  const url = 'file:///' + svgPath.replace(/\\/g, '/');
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'shot.mjs'), url, '--w', String(W), '--h', String(Hpx), '--wait', '300', '--out', svgPath.replace(/\.svg$/, '.png')], { stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
}
