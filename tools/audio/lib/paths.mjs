// Shared filesystem locations for the audio pipeline.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../..');
export const TOOL = path.join(ROOT, 'tools/audio');
export const SRC = path.join(TOOL, 'src');                 // downloaded CC0 sources (gitignored)
export const DL = path.join(SRC, '_dl');                   // raw downloads (archives)
export const INVENTORY = path.join(SRC, 'inventory.json');
export const OUT = path.join(TOOL, 'out');                 // reports, previews, caches (gitignored)
export const PROVENANCE = path.join(TOOL, 'provenance');   // committed: which sources each category used
export const PRODUCERS = path.join(TOOL, 'producers');
// shipped output; CF_AUDIO_OUT redirects it (dry runs / examples: build.mjs --out <dir>)
export const AUDIO = process.env.CF_AUDIO_OUT ? path.resolve(ROOT, process.env.CF_AUDIO_OUT) : path.join(ROOT, 'game/assets/audio');
export const AUDIO_IS_DEFAULT = !process.env.CF_AUDIO_OUT;
export const CREDITS = path.join(ROOT, 'docs/CREDITS.md');
export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
