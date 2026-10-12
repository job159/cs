// Procedural particle atlas (4x4 frames of 256 px), generated once on a canvas.
//  0 soft glow      1 smoke puff A   2 smoke puff B   3 spark streak
//  4 flash star A   5 flash star B   6 flash side     7 blood drop
//  8 blood mist     9 debris chunk   10 flame         11 shock ring
//  12 dust          13 ember         14 bullet hole   15 blood splat (decal)
import * as THREE from 'three';

export const FRAME = { glow: 0, smoke: 1, smoke2: 2, spark: 3, flash: 4, flash2: 5, flashSide: 6, drop: 7, mist: 8, chunk: 9, flame: 10, ring: 11, dust: 12, ember: 13, hole: 14, splat: 15 };

function rnd(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function radial(g, cx, cy, r, stops) {
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
}

function puff(g, ox, oy, seed, dark = false) {
  const r = rnd(seed);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 70;
    const x = ox + 128 + Math.cos(a) * d, y = oy + 128 + Math.sin(a) * d, rad = 30 + r() * 45;
    const v = dark ? 140 + r() * 60 : 190 + r() * 65;
    radial(g, x, y, rad, [[0, `rgba(${v},${v},${v},0.22)`], [1, `rgba(${v},${v},${v},0)`]]);
  }
}

function star(g, ox, oy, seed, arms, len, width) {
  const r = rnd(seed);
  g.save();
  g.translate(ox + 128, oy + 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + r() * 0.5;
    const l = len * (0.55 + r() * 0.45), w = width * (0.6 + r() * 0.6);
    g.save(); g.rotate(a);
    const gr = g.createLinearGradient(0, 0, l, 0);
    gr.addColorStop(0, 'rgba(255,240,210,0.95)'); gr.addColorStop(0.4, 'rgba(255,180,90,0.6)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -w); g.quadraticCurveTo(l * 0.5, -w * 0.4, l, 0); g.quadraticCurveTo(l * 0.5, w * 0.4, 0, w); g.closePath(); g.fill();
    g.restore();
  }
  radial(g, 0, 0, 60, [[0, 'rgba(255,255,240,1)'], [0.35, 'rgba(255,210,140,0.8)'], [1, 'rgba(255,140,60,0)']]);
  g.restore();
}

export function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  const at = (i) => [(i % 4) * 256, Math.floor(i / 4) * 256];
  let o;
  // 0 soft glow
  o = at(0); radial(g, o[0] + 128, o[1] + 128, 128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  // 1,2 smoke
  o = at(1); puff(g, o[0], o[1], 7);
  o = at(2); puff(g, o[0], o[1], 99, true);
  // 3 spark streak (horizontal, stretched along velocity)
  o = at(3);
  { const gr = g.createLinearGradient(o[0] + 20, 0, o[0] + 236, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(o[0] + 128, o[1] + 128, 110, 10, 0, 0, Math.PI * 2); g.fill(); }
  // 4,5 flash stars, 6 side flash (cone)
  o = at(4); star(g, o[0], o[1], 3, 5, 125, 22);
  o = at(5); star(g, o[0], o[1], 17, 7, 118, 16);
  o = at(6);
  { g.save(); g.translate(o[0], o[1] + 128); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.3, 'rgba(255,190,100,0.7)'); gr.addColorStop(1, 'rgba(255,110,30,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -18 + k * 4); g.quadraticCurveTo(140, -40 - k * 10, 256, -6 + k * 5); g.lineTo(256, 6 - k * 5); g.quadraticCurveTo(140, 40 + k * 10, 0, 18 - k * 4); g.fill();
    }
    g.restore(); }
  // 7 blood drop
  o = at(7); radial(g, o[0] + 128, o[1] + 128, 80, [[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
  // 8 blood mist
  o = at(8); puff(g, o[0], o[1], 55);
  // 9 debris chunk (irregular polygon)
  o = at(9);
  { const r = rnd(5); g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, d = 60 + r() * 50; const x = o[0] + 128 + Math.cos(a) * d, y = o[1] + 128 + Math.sin(a) * d; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.fill(); }
  // 10 flame
  o = at(10);
  { const r = rnd(31); g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) { const x = o[0] + 128 + (r() - 0.5) * 90, y = o[1] + 150 - r() * 110; radial(g, x, y, 30 + r() * 40, [[0, 'rgba(255,230,180,0.35)'], [0.5, 'rgba(255,140,40,0.2)'], [1, 'rgba(255,80,10,0)']]); }
    g.restore(); }
  // 11 shock ring
  o = at(11);
  { const gr = g.createRadialGradient(o[0] + 128, o[1] + 128, 70, o[0] + 128, o[1] + 128, 126); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(o[0], o[1], 256, 256); }
  // 12 dust
  o = at(12); puff(g, o[0], o[1], 1234, true);
  // 13 ember
  o = at(13); radial(g, o[0] + 128, o[1] + 128, 60, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
  // 14 bullet hole (decal): dark core, torn rim, soot ring
  o = at(14);
  { const r = rnd(77), cx = o[0] + 128, cy = o[1] + 128;
    radial(g, cx, cy, 120, [[0, 'rgba(20,18,16,0.9)'], [0.35, 'rgba(30,28,25,0.55)'], [1, 'rgba(30,28,25,0)']]);
    g.fillStyle = 'rgba(70,66,60,0.9)';
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (30 + r() * 30), cy + Math.sin(a) * (30 + r() * 30)); g.lineTo(cx + Math.cos(a + 0.2) * 22, cy + Math.sin(a + 0.2) * 22); g.fill(); }
    radial(g, cx, cy, 30, [[0, 'rgba(0,0,0,1)'], [0.7, 'rgba(5,5,5,1)'], [1, 'rgba(10,10,10,0)']]); }
  // 15 blood splat (decal)
  o = at(15);
  { const r = rnd(808), cx = o[0] + 128, cy = o[1] + 128; g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, d = 45 + r() * 30; const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.fill();
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = 60 + r() * 60, rr = 3 + r() * 10; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2); g.fill(); } }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
