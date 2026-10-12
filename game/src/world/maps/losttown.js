// 失落之城 LOST TOWN — first chapter map, recreating the layout of CSO's Season-1 survival map Lost City
// (virus-sealed North-American industrial town, cross-shaped street blocks, central intersection defence).
// Built by tools/map/compile.mjs losttown from tools/map/losttown/ (layout.mjs + zones/*.mjs).
import { buildPackageMap } from '../mapPackage.js';

export const build = (ctx) => buildPackageMap('losttown', ctx);
