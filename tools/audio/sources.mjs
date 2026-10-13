// Catalog of CC0 audio sources fetched by tools/audio/fetch.mjs into tools/audio/src/ (gitignored).
// Every pack's licence is re-checked on its page at fetch time; every Freesound id is checked on its own sound page
// (the licence link must be creativecommons.org/publicdomain/zero/1.0). Non-CC0 items are skipped, never downloaded.
//
// To add sources without touching this file (parallel producer agents): drop a JSON array into
// tools/audio/sources.d/<your-name>.json with Freesound entries like { "id": 123456, "tags": ["metal", "impact"] },
// or run:  node tools/audio/fetch.mjs --add-fs 123456,234567 --to <your-name> --tags metal,impact
// Find candidates with:  node tools/audio/fetch.mjs --search "bone crunch" [--sort downloads]

const OGA = 'https://opengameart.org/sites/default/files/';

/** Packs. kind: '7z' | 'zip' | 'files'. licence: what the page must show. tagger(relPath, meta) -> extra tags. */
export const PACKS = [
  {
    id: 'ffsl', kind: '7z', title: 'The Free Firearm Sound Library (Prepared SFX Library)',
    page: 'https://opengameart.org/content/the-free-firearm-sound-library',
    url: OGA + 'Prepared%20SFX%20Library.7z', file: 'oga-free-firearm-sound-library.7z', size: 193954738,
    author: 'Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney', check: 'oga', tags: ['gun', 'real-recording'],
    stripPrefix: 'Prepared SFX Library/', metaCsv: 'Prepared Master Sheet.csv',
  },
  {
    id: 'oga_zombies', kind: 'zip', title: 'Zombies Sound Pack', page: 'https://opengameart.org/content/zombies-sound-pack',
    url: OGA + 'zombies.zip', size: 4667201, author: 'artisticdude', check: 'oga', tags: ['zombie', 'voice'],
  },
  {
    id: 'oga_voicefx', kind: 'zip', title: 'Voice Effects: Zombie / Skeleton / Monster / Human Male',
    page: 'https://opengameart.org/content/zombie-skeleton-monster-voice-effects',
    url: OGA + 'Voice%20Effects%20Zombie-Skeleton-Monster%20Human%20Male.zip', size: 2047881, author: 'ArcadeParty', check: 'oga', tags: ['voice'],
  },
  {
    id: 'oga_undead_moans', kind: 'zip', title: 'Undead Moans', page: 'https://opengameart.org/content/undead-moans',
    url: OGA + 'undead-moans.zip', size: 96239, author: 'AntumDeluge', check: 'oga', tags: ['zombie', 'voice', 'moan'],
  },
  {
    id: 'oga_zombie_moans', kind: 'files', title: 'Zombie Moans', page: 'https://opengameart.org/content/zombie-moans',
    urls: [OGA + 'darsycho__zombie-moans.ogg'], author: 'Darsycho', check: 'oga', tags: ['zombie', 'voice', 'moan'],
  },
  {
    id: 'oga_hungry_ghoul', kind: 'files', title: 'Hungry Ghoul', page: 'https://opengameart.org/content/hungry-ghoul',
    urls: [OGA + 'hungry-ghoul.ogg'], author: 'Darsycho', check: 'oga', tags: ['zombie', 'voice', 'ghoul', 'growl'],
  },
  {
    id: 'oga_zombie_pain', kind: 'files', title: 'Zombie Pain', page: 'https://opengameart.org/content/zombie-pain',
    urls: [OGA + 'zombie_pain.wav'], author: 'Vinrax', check: 'oga', tags: ['zombie', 'voice', 'pain'],
    note: 'dual-licensed CC-BY 3.0 / CC0 on the page; used under CC0',
  },
  {
    id: 'oga_gun_reload', kind: 'files', title: 'Gun Reload Sounds', page: 'https://opengameart.org/content/gun-reload-sounds',
    urls: [OGA + 'assaultriflereload1_0.wav', OGA + 'gunreload1.wav', OGA + 'shotguncock_0.wav'], author: 'SpringySpringo', check: 'oga', tags: ['gun', 'foley', 'reload'],
  },
  {
    id: 'oga_shotgun_reload', kind: 'zip', title: 'Shotgun Reload Sound Effects', page: 'https://opengameart.org/content/shotgun-reload-sound-effects',
    url: OGA + 'shotgunsounds.zip', size: 324193, author: 'zer0_sol', check: 'oga', tags: ['gun', 'foley', 'reload', 'shotgun'],
  },
  {
    id: 'oga_distant_explosion', kind: 'files', title: 'Muffled Distant Explosion', page: 'https://opengameart.org/content/muffled-distant-explosion',
    urls: [OGA + 'NenadSimic%20-%20Muffled%20Distant%20Explosion.wav'], author: 'NenadSimic', check: 'oga', tags: ['explosion', 'distant'],
  },
  {
    id: 'oga_snow_gravel_steps', kind: '7z', title: '42 Snow and Gravel Footsteps', page: 'https://opengameart.org/content/42-snow-and-gravel-footsteps',
    url: OGA + 'corsica_s-walking_in_snow.7z', size: 4041779, author: 'Corsica_S', check: 'oga', tags: ['footstep', 'snow', 'gravel'],
  },
  {
    id: 'oga_metal_steps', kind: '7z', title: 'Metal Footsteps on Concrete', page: 'https://opengameart.org/content/metal-footsteps-on-concrete',
    url: OGA + 'metal_steps_48k24b.7z', size: 672381, author: 'Thimras', check: 'oga', tags: ['footstep', 'metal'],
  },
  {
    id: 'oga_fire', kind: 'files', title: 'Fire Crackling', page: 'https://opengameart.org/content/fire-crackling',
    urls: [OGA + 'fire-1.wav'], author: 'AntumDeluge', check: 'oga', tags: ['fire', 'crackle', 'ambience'],
  },
  {
    id: 'kenney_impact', kind: 'zip', title: 'Kenney Impact Sounds', page: 'https://kenney.nl/assets/impact-sounds',
    urlFromPage: /href=['"](https:\/\/kenney\.nl\/media\/pages\/assets\/impact-sounds\/[^'"]+\.zip)['"]/,
    author: 'Kenney (kenney.nl)', check: 'kenney', tags: ['impact', 'clean'],
  },
];

/**
 * Freesound CC0 sounds (hq Ogg previews). [id, tags]. Titles/authors/user ids are read from the sound page at fetch
 * time. First block = docs/research/04-asset-sources.md §3.3, the rest found via the CC0 search filter (2026-10).
 */
export const FREESOUND = [
  // --- guns (real recordings)
  [427596, ['gun', 'rifle', 'ar15', 'single', 'close']], [427597, ['gun', 'rifle', 'ar15', 'single', 'distant']],
  [427592, ['gun', 'pistol', '9mm', 'single', 'close']], [427594, ['gun', 'pistol', 'magnum', 'single', 'close']],
  [427595, ['gun', 'shotgun', 'single', 'close']], [259758, ['gun', 'rifle', 'm4', 'auto', 'burst']],
  [238916, ['gun', 'rifle', 'single']], [165394, ['gun', 'mg', 'auto', 'heavy']], [396324, ['gun', 'mg', 'auto', 'heavy', 'long']],
  [514228, ['gun', 'sniper', 'single']], [410442, ['gun', 'rifle', 'bolt', 'single']], [205588, ['gun', 'battle', 'distant', 'ambience']],
  // --- explosions
  [235968, ['explosion']], [244394, ['explosion', 'metallic']], [523365, ['explosion', 'bomb']],
  [609587, ['explosion', 'grenade', 'medium']], [516914, ['explosion', 'medium']], [563010, ['explosion']],
  [142598, ['explosion', 'distant', 'boom']], [209769, ['explosion', 'distant']], [324277, ['explosion', 'distant']],
  // --- gun foley
  [393732, ['gun', 'foley', 'rifle', 'magazine', 'ar15']], [393734, ['gun', 'foley', 'pistol', 'slide', 'glock']],
  [396331, ['gun', 'foley', 'pistol', 'reload', '1911']], [432141, ['gun', 'foley', 'rifle', 'shotgun', 'reload']],
  [432139, ['gun', 'foley', 'pistol', 'reload']], [370345, ['gun', 'foley', 'bolt', 'mosin']], [674744, ['gun', 'foley', 'pistol', 'slide']],
  [318964, ['gun', 'shell', 'casing', 'bounce']], [210102, ['gun', 'shell', 'casing', 'concrete']], [147261, ['gun', 'shell', 'shotgun', 'eject']],
  [620929, ['gun', 'shell', 'shotgun', 'bounce']], [677160, ['gun', 'foley', 'smg', 'reload', 'uzi']], [674742, ['gun', 'foley', 'rifle', 'reload', 'ak47']],
  [205126, ['gun', 'shell', 'casing', 'bounce']], [431830, ['gun', 'foley', 'magazine', 'load']], [706404, ['gun', 'foley', 'bolt']],
  [501562, ['gun', 'foley', 'revolver', 'dryfire', 'click']], [632822, ['gun', 'foley', 'cock']],
  // --- bullet impacts / ricochets / surfaces
  [423301, ['impact', 'flesh', 'bullet']], [511194, ['impact', 'flesh', 'headshot']], [144444, ['impact', 'bullet']],
  [148840, ['impact', 'ricochet']], [392975, ['impact', 'ricochet']], [675951, ['impact', 'metal', 'bullet', 'target']],
  [855248, ['bullet', 'flyby']], [779805, ['impact', 'flesh', 'meaty']], [411671, ['impact', 'flesh', 'squish', 'blood']],
  [30932, ['impact', 'ricochet']], [148827, ['impact', 'ricochet']], [675955, ['impact', 'ricochet', 'rifle']],
  [351371, ['impact', 'metal', 'ping']], [406562, ['impact', 'metal']], [201094, ['impact', 'metal', 'clang', 'deep']],
  [54850, ['impact', 'metal', 'wood', 'rubber']], [319229, ['impact', 'dirt', 'rock']], [319222, ['impact', 'dirt', 'rock']],
  [319214, ['impact', 'dirt', 'wood']], [221528, ['impact', 'glass', 'break']], [244238, ['impact', 'glass', 'smash']],
  [202093, ['impact', 'glass', 'bottle']], [442773, ['impact', 'water', 'splash']], [212143, ['impact', 'water', 'splash']],
  [398032, ['impact', 'water', 'splash']],
  // --- gore / bone
  [134025, ['gore', 'bone', 'snap', 'neck']], [249811, ['gore', 'bone', 'crunch']], [192146, ['gore', 'bone', 'crunch']],
  [392883, ['gore', 'bone', 'crunch']], [574752, ['gore', 'bone', 'snap', 'celery']], [355052, ['gore', 'bone', 'crunch']],
  [144159, ['gore', 'bone', 'snap', 'neck']], [211605, ['gore', 'flesh', 'squish', 'slime']], [211606, ['gore', 'bone', 'break']],
  [234236, ['gore', 'flesh', 'rip', 'carcass']], [631895, ['gore', 'flesh', 'squish']], [222363, ['gore', 'flesh', 'slime', 'goo']],
  [697829, ['gore', 'bone', 'skull', 'crush']], [454622, ['gore', 'flesh', 'gurgle', 'blood']], [241950, ['impact', 'punch', 'body']],
  [155973, ['gore', 'flesh', 'bite', 'zombie']],
  // --- knife / melee / body falls
  [179222, ['knife', 'stab']], [411742, ['knife', 'stab', 'pull']], [411743, ['knife', 'stab']], [35213, ['knife', 'slash']],
  [420674, ['knife', 'slash', 'cut']], [471097, ['knife', 'swing', 'whoosh']], [264062, ['melee', 'hit', 'voice', 'bodyfall']],
  [417994, ['bodyfall']], [504626, ['bodyfall', 'heavy', 'dirt']], [128103, ['bodyfall', 'wood', 'slam']],
  [250033, ['bodyfall']], [181177, ['bodyfall', 'floor']], [187136, ['bodyfall']],
  // --- zombies / creatures
  [213509, ['zombie', 'voice', 'attack']], [111044, ['zombie', 'voice', 'group', 'ambience']], [58626, ['zombie', 'voice', 'moan']],
  [133974, ['zombie', 'voice', 'growl']], [125405, ['monster', 'voice', 'groan', 'grunt', 'slobber']], [435651, ['zombie', 'voice', 'scream', 'demon']],
  [179345, ['monster', 'voice', 'scream']], [245223, ['zombie', 'voice', 'roar']], [426637, ['zombie', 'voice', 'choke']],
  [555412, ['zombie', 'voice', 'death']], [534602, ['zombie', 'voice', 'death']], [234237, ['gore', 'eating', 'flesh']],
  [42201, ['monster', 'voice', 'snarl']], [463721, ['zombie', 'voice', 'groan', 'burp']], [404920, ['monster', 'voice', 'growl', 'beast']],
  [170454, ['monster', 'voice', 'beast', 'angry']], [481642, ['monster', 'voice', 'growl']],
  [132874, ['monster', 'voice', 'roar', 'short']], [342204, ['monster', 'voice', 'snarl']], [261464, ['monster', 'voice', 'breath', 'sniff']],
  [391552, ['monster', 'voice', 'scream']], [402861, ['voice', 'scream', 'gurgle']], [370710, ['voice', 'vomit', 'spit']],
  [237386, ['voice', 'spit', 'blood']], [382313, ['acid', 'sizzle']], [202094, ['acid', 'bubble']], [423959, ['liquid', 'bubble']],
  [213566, ['liquid', 'gurgle']],
  // --- screams (screamer / player)
  [333832, ['voice', 'scream', 'female', 'demonic']], [320740, ['voice', 'scream', 'female', 'shriek']], [219856, ['voice', 'scream']],
  [35716, ['voice', 'scream']], [556976, ['voice', 'scream', 'male']], [173944, ['voice', 'scream', 'male']],
  // --- footsteps
  [459964, ['footstep', 'concrete']], [244310, ['footstep', 'pavement', 'long']], [155858, ['footstep', 'concrete', 'wood', 'hall']],
  [352870, ['footstep', 'dirt', 'gravel']], [274832, ['footstep', 'gravel']], [376809, ['footstep', 'mud', 'wet']],
  [167686, ['footstep', 'concrete', 'corridor']], [521590, ['footstep', 'boot', 'stone']], [456428, ['footstep', 'boot', 'asphalt']],
  [148462, ['footstep', 'metal']], [208101, ['footstep', 'metal']], [696374, ['footstep', 'metal']], [452421, ['footstep', 'metal', 'stairs']],
  [530589, ['footstep', 'boot', 'gravel']], [98493, ['footstep', 'gravel']], [418545, ['footstep', 'run', 'concrete']],
  [235470, ['footstep', 'run', 'boot']], [465299, ['footstep', 'concrete']], [363470, ['footstep', 'run', 'wood']], [485421, ['footstep', 'wood']],
  // --- ambience
  [117136, ['ambience', 'wind', 'cold']], [459981, ['ambience', 'wind', 'strong']], [22331, ['ambience', 'wind']], [146932, ['ambience', 'wind', 'gust']],
  [466122, ['ambience', 'wind', 'night', 'trees']], [577312, ['ambience', 'siren', 'city']], [469363, ['ambience', 'siren', 'distant']],
  [568814, ['ambience', 'siren', 'distant', 'city']], [535776, ['ambience', 'siren', 'distant']],
  [363092, ['ambience', 'fire', 'crackle']], [563765, ['ambience', 'fire', 'car']], [563766, ['ambience', 'fire', 'crackle']],
  [181563, ['ambience', 'fire', 'crackle']], [414767, ['ambience', 'fire', 'crackle']], [686762, ['ambience', 'abandoned', 'building', 'long']],
  [155142, ['ambience', 'terror', 'drone']], [342878, ['ambience', 'harbor', 'wind', 'night', 'long']], [360633, ['ambience', 'harbor', 'marina', 'wind', 'rigging']],
  [443019, ['ambience', 'harbor', 'waves', 'distant']], [555134, ['ambience', 'harbor', 'water', 'barge', 'creak']], [352356, ['ambience', 'water', 'waves', 'lapping']],
  [384360, ['ambience', 'water', 'waves', 'breakwater']], [353416, ['ambience', 'gull', 'beach']], [462462, ['ambience', 'gull']],
  [537854, ['ambience', 'gull', 'distant']], [263786, ['gull', 'single']], [237329, ['ambience', 'city', 'night']],
  [427841, ['ambience', 'city', 'night', 'roomtone']], [330427, ['ambience', 'city', 'traffic', 'distant', 'long']], [208502, ['ambience', 'highway', 'distant']],
  [129679, ['ambience', 'city', 'noise', 'long']],
  // --- vehicles / machines (rocket, minigun motor, saw)
  [182794, ['rocket', 'launch']], [211617, ['rocket', 'launch', 'distant']], [184274, ['rocket', 'missile', 'launch']],
  [125401, ['motor', 'electric', 'whir']], [594042, ['motor', 'spinup', 'spindown']], [554366, ['saw', 'circular', 'motor']],
  [448133, ['saw', 'circular']],
  // --- debris
  [321143, ['debris', 'concrete', 'glass', 'break']], [333988, ['debris', 'glass', 'metal', 'distant', 'falling']],
  // ---- second batch (2026-10-12, Freesound CC0 search; every page re-verified by fetch.mjs) ----
  // explosions / debris
  [523089, ['explosion', 'medium']], [136765, ['explosion']],
  [398283, ['explosion']], [258195, ['explosion', 'deep']], [366086, ['explosion', 'debris', 'crash', 'long']],
  [264031, ['explosion', 'distant']], [372086, ['explosion', 'distant']], [132861, ['explosion', 'distant']],
  [275196, ['explosion', 'distant']], [162363, ['explosion', 'distant', 'grenade', 'rocket']], [159402, ['explosion', 'overhead']],
  [163458, ['gun', 'launcher', 'grenade', 'thump']], [703247, ['debris', 'falling', 'crash', 'big']], [703248, ['debris', 'falling', 'crash']],
  [530209, ['debris', 'falling', 'metal']],
  // gore / bone / body
  [641046, ['gore', 'flesh', 'impact']], [385965, ['gore', 'flesh', 'crunch', 'rip', 'wet']], [221089, ['gore', 'flesh', 'squish', 'goo']],
  [433840, ['gore', 'slime', 'squish']], [269483, ['gore', 'flesh', 'chop', 'knife']], [237387, ['voice', 'spit', 'blood']],
  [215140, ['gore', 'bone', 'crack']], [488659, ['gore', 'bone', 'fracture']], [578874, ['gore', 'bone', 'snap']],
  [272224, ['gore', 'bone', 'crunch', 'eggshell']], [422622, ['gore', 'bone', 'flesh', 'movement']], [399183, ['impact', 'punch', 'body']],
  [82027, ['bodyfall']], [447922, ['bodyfall', 'wood', 'snap']], [395331, ['bodyfall', 'ground']], [504617, ['bodyfall']], [119825, ['bodyfall', 'carpet']],
  // footsteps
  [50724, ['footstep', 'metal']], [50723, ['footstep', 'metal', 'muffled']], [556715, ['footstep', 'metal']], [463811, ['footstep', 'metal']],
  [451864, ['footstep', 'metal', 'stairs']], [244590, ['footstep', 'gravel', 'sand']], [456038, ['footstep', 'gravel', 'run']],
  [264469, ['footstep', 'dirt']], [353799, ['footstep', 'dirt']], [240732, ['footstep', 'concrete', 'boot', 'march', 'loop']],
  [149234, ['footstep', 'concrete', 'sidewalk']], [62306, ['footstep', 'concrete', 'hard']], [495474, ['footstep', 'boot', 'warehouse', 'concrete']],
  [349865, ['footstep', 'tile']],
  // ambience: gulls, harbour, sirens, city, wind, fire
  [32930, ['ambience', 'gull']], [510917, ['ambience', 'gull']], [537853, ['ambience', 'gull', 'many']], [195876, ['ambience', 'harbor', 'water']],
  [208714, ['ambience', 'harbor', 'ship', 'horn']], [572365, ['ambience', 'siren', 'police', 'distant', 'city']], [324276, ['ambience', 'siren']],
  [385867, ['ambience', 'siren', 'police']], [454822, ['ambience', 'city', 'night']], [423644, ['ambience', 'city', 'night']],
  [26221, ['ambience', 'city', 'rain']], [117611, ['ambience', 'wind', 'howl']], [185070, ['ambience', 'wind', 'howl']],
  [405601, ['ambience', 'wind', 'howl']], [521820, ['ambience', 'wind', 'cold']], [159509, ['ambience', 'wind', 'night', 'eerie']],
  [532191, ['ambience', 'fire', 'crackle']], [350757, ['ambience', 'fire', 'crackle', 'campfire']], [508110, ['ambience', 'fire', 'crackle', 'pops']],
  [363093, ['ambience', 'fire', 'crackle']],
  // gun foley / shells / guns
  [153560, ['gun', 'foley', 'lever', 'cock', 'rifle']], [402790, ['gun', 'foley', 'revolver', 'cock']], [405538, ['gun', 'foley', 'pistol', 'cock']],
  [164930, ['gun', 'foley', 'pistol', 'cock']], [240698, ['gun', 'foley', 'revolver', 'cock']], [460859, ['gun', 'shell', 'casing', 'drop']],
  [182266, ['gun', 'shell', 'casing', 'release']], [177863, ['gun', 'foley', 'revolver', 'reload']],
  [712702, ['gun', 'garage', 'indoor', 'single', 'burst', 'synth']], [816113, ['gun', 'sniper', 'single']],
];

/**
 * Freesound uploads flagged by the film/game keyword check (lib/freesound.mjs SUSPICIOUS) that were read by hand and are
 * the uploader's own recordings. Anything flagged and NOT listed here gets `suspicious: true` in the inventory and must
 * not be used.
 */
export const REVIEWED = {
  351371: 'self-recorded pots and pans; "for a game or a movie" describes the intended use',
  134025: "self-made effect for the author's film-school project",
  392883: "self-recorded lollipop crunch made for the author's own short film",
  404920: "the uploader's own dog, recorded by the uploader ('I will use this in a short film')",
  264062: 'designed by the uploader from their own punch / body-fall recordings for a film they worked on',
  382313: "the uploader's own recordings (water on a hot pan) made for their short film",
  385965: "from the uploader's own sound library (VEGECIDE), released here as CC0 by the author",
};

/**
 * Removed after reading the source pages (kept here so nobody re-adds them):
 *   262436  'Real explosions Real gunshots' — "salvaged from a hidden camera on location of the ambush": not the uploader's recording
 *   398908  'Monster Roar 2' — page gives no provenance (only a link-shortener to an external library)
 *   705395  'Distant police siren' — AI-generated
 *   251759  'BOOMING PUNCHY EXPLOSION' — recorded on a film shoot: rights may sit with the production, not the recordist
 */
