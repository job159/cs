// Kit test corner (tools/map/_kittest): validation map for the map kit / compiler / package loader.
import { buildPackageMap } from '../mapPackage.js';

export const build = (ctx) => buildPackageMap('_kittest', ctx);
