// Freesound helpers that need NO account / API key:
//   - search(): scrapes the public search page with the CC0 licence filter (15 results per page)
//   - soundPage(): fetches a sound's page and extracts title, author, licence link, tags, preview URLs
//   - previewUrl(): builds the high-quality Ogg preview URL (cdn.freesound.org/previews/<id/1000>/<id>_<userId>-hq.ogg)
// Only CC0 sounds may be used in this project; verifyCC0() checks the licence link on the sound page itself
// (the search filter alone is not trusted).
const UA = 'Mozilla/5.0 (calamity-front audio fetcher; CC0 sources only)';
const CC0_RE = /creativecommons\.org\/publicdomain\/zero\/1\.0/;

let lastRequest = 0;
async function politeFetch(url, opts = {}) {
  const wait = 1100 - (Date.now() - lastRequest); // <= ~1 request/second to freesound.org pages
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', ...opts });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

const attr = (block, name) => {
  const m = block.match(new RegExp(`data-${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : undefined;
};

export function decodeEntities(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
}

export function previewUrl(id, userId, kind = 'hq.ogg') {
  return `https://cdn.freesound.org/previews/${Math.floor(id / 1000)}/${id}_${userId}-${kind}`;
}

/**
 * Search Freesound for CC0 sounds (no login). Returns [{ id, user, userId, title, duration, sampleRate, downloads, preview }].
 * opts: { page = 1, sort = 'score' | 'downloads' | 'rating' | 'duration_asc' | 'duration_desc', minDur, maxDur }
 */
export async function search(query, { page = 1, sort = 'score', minDur, maxDur } = {}) {
  const sorts = { score: '', downloads: 'Downloads (most first)', rating: 'Rating (highest first)', duration_asc: 'Duration (shortest first)', duration_desc: 'Duration (longest first)' };
  let f = 'license:"Creative Commons 0"';
  if (minDur !== undefined || maxDur !== undefined) f += ` duration:[${minDur ?? 0} TO ${maxDur ?? '*'}]`;
  const u = new URL('https://freesound.org/search/');
  u.searchParams.set('q', query);
  u.searchParams.set('f', f);
  if (sorts[sort]) u.searchParams.set('s', sorts[sort]);
  if (page > 1) u.searchParams.set('page', String(page));
  const html = await (await politeFetch(u.href)).text();
  const out = [];
  const parts = html.split('class="bw-player"').slice(1);
  for (const p of parts) {
    const block = p.slice(0, 3000);
    const id = +attr(block, 'sound-id');
    if (!id) continue;
    const userId = +attr(block, 'user-id');
    out.push({
      id, user: attr(block, 'username'), userId, title: attr(block, 'title'),
      duration: +attr(block, 'duration'), sampleRate: +attr(block, 'samplerate'), downloads: +(attr(block, 'num-downloads') || 0),
      preview: previewUrl(id, userId),
      page: `https://freesound.org/people/${attr(block, 'username')}/sounds/${id}/`,
    });
  }
  return out;
}

/** Fetch and parse a sound page: { id, title, user, userId, licence, licenceUrl, cc0, tags, description, preview, page }. */
export async function soundPage(id) {
  const res = await politeFetch(`https://freesound.org/s/${id}/`);
  if (!res.ok) throw new Error(`freesound ${id}: HTTP ${res.status}`);
  const html = await res.text();
  const page = res.url;
  const lic = html.match(/title="Go to the full license text" href="([^"]+)"[^>]*>([^<]+)</);
  const licenceUrl = lic ? lic[1] : null;
  const licence = lic ? decodeEntities(lic[2]).trim() : null;
  const title = decodeEntities((html.match(/<title>Freesound - (.+?) by ([^<]+)<\/title>/) || [])[1] || '');
  const user = decodeEntities((html.match(/<title>Freesound - .+? by ([^<]+)<\/title>/) || [])[1] || '').trim();
  const pv = html.match(/previews\/(\d+)\/(\d+)_(\d+)-hq\.mp3/);
  const userId = pv ? +pv[3] : null;
  const tags = [...new Set([...html.matchAll(/href="\/browse\/tags\/([^/"]+)\/"/g)].map((m) => decodeEntities(m[1])))];
  const descM = html.match(/<div[^>]*id="soundDescriptionSection"[^>]*>([\s\S]*?)<\/div>/) || html.match(/<meta name="twitter:description" content="([^"]*)"/);
  const description = descM ? decodeEntities(descM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 600) : '';
  return {
    id, title, user, userId, licence, licenceUrl, cc0: !!(licenceUrl && CC0_RE.test(licenceUrl)), tags, description,
    preview: userId ? previewUrl(id, userId) : null, page,
  };
}

/** Words that hint a "CC0" upload was ripped from a film/game (see docs/research/04-asset-sources.md §3.1). */
export const SUSPICIOUS = /\b(movie|film|trailer|ripped|rip|game ?audio|from (the )?game|copyright|halo|call of duty|cod\b|battlefield|counter[- ]?strike|resident evil|left 4 dead|l4d|half[- ]?life|doom|star wars|jurassic)\b/i;

export async function verifyCC0(id) {
  const info = await soundPage(id);
  const suspicious = SUSPICIOUS.test(`${info.title} ${info.description}`);
  return { ...info, suspicious };
}

export { politeFetch, UA };
