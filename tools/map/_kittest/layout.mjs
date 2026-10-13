// Kit test map: one street corner exercising every kit family (validation for tools/map/compile.mjs and the
// runtime loader). Compile: node tools/map/compile.mjs _kittest [--fast]; play: index.html?map=kittest
export const META = {
  id: '_kittest', name: '套件測試街角', nameEn: 'Kit Test Corner',
  bounds: [-34, -2, -34, 34, 30, 34], killY: -10, chunk: 40, lightmapResolution: 8,
};
export const ENV = {
  sun: { dir: [-0.52, 0.48, -0.71], color: '#ffc896', intensity: 3.4, angle: 1.0, shadow: { mapSize: 2048, extent: 40 } },
  sky: { hdri: 'kloppenheim_01_puresky', rotationDeg: 0, envIntensity: 0.5, backgroundIntensity: 0.75 },
  fog: { color: 'auto', density: 0.009 },
  exposure: 1.0,
};
export const ZONES = [{ id: 'corner', name: '街角', polygon: [[-34, -34], [34, -34], [34, 34], [-34, 34]] }];
