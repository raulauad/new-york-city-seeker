
const NYC_BBOX = { minLat: 40.40, maxLat: 41.05, minLon: -74.30, maxLon: -73.60 };
const NYC_QIDS = new Set(["Q60","Q11299","Q1384","Q18424","Q41079","Q34499"]); // NYC + boroughs

//cache para entidades wikidata
const WD_CACHE  = new Map();

//cache para categorias de wiki
const CAT_CACHE = new Map();   

const inNycBbox = (lat,lon) =>
  typeof lat==="number" && typeof lon==="number" &&
  lat>=NYC_BBOX.minLat && lat<=NYC_BBOX.maxLat &&
  lon>=NYC_BBOX.minLon && lon<=NYC_BBOX.maxLon;

function isDisambiguation(summary){
  const d = (summary?.description||"") + " " + (summary?.type||"");
  return /desambiguaci[oó]n|disambiguation/i.test(d);
}

async function fetchWikidataEntity(wikibaseId){
  if (!wikibaseId) return null;
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wikibaseId)}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.entities?.[wikibaseId] ?? null;
}

// P131 NYC 
async function wikidataLocatedInNYC(wikibaseId){
  if (!wikibaseId) return false;
  const ck = `P131:${wikibaseId}`;
  if (WD_CACHE.has(ck)) return WD_CACHE.get(ck);
  let ok = false;
  try{
    const ent = await fetchWikidataEntity(wikibaseId);
    const p131 = (ent?.claims?.P131 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    if (p131.some(id => NYC_QIDS.has(id))) ok = true;
    if (!ok){
      for (const qid of p131){
        const ent2 = await fetchWikidataEntity(qid);
        const p131b = (ent2?.claims?.P131 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
        if (p131b.some(id => NYC_QIDS.has(id))) { ok = true; break; }
      }
    }
  }catch{}
  WD_CACHE.set(ck, ok);
  return ok;
}

// P276 (held at) en NYC
async function wikidataHeldAtNYC(wikibaseId){
  if (!wikibaseId) return false;
  const ck = `P276:${wikibaseId}`;
  if (WD_CACHE.has(ck)) return WD_CACHE.get(ck);
  let ok = false;
  try{
    const ent = await fetchWikidataEntity(wikibaseId);
    const p276 = (ent?.claims?.P276 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    if (p276.some(id => NYC_QIDS.has(id))) ok = true;
  }catch{}
  WD_CACHE.set(ck, ok);
  return ok;
}

//Es un evento (P31) o subclase de evento (P279)
const EVENT_LIKE_QIDS = new Set(["Q1656682","Q1190554","Q132241","Q15275719","Q1692075"]);
async function wikidataIsEventLike(wikibaseId){
  if (!wikibaseId) return false;
  const ck = `P31:${wikibaseId}`;
  if (WD_CACHE.has(ck)) return WD_CACHE.get(ck);
  let ok = false;
  try{
    const ent = await fetchWikidataEntity(wikibaseId);
    const p31 = (ent?.claims?.P31 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    if (p31.some(id => EVENT_LIKE_QIDS.has(id))) ok = true;
    if (!ok){
      for (const qid of p31){
        const ent2 = await fetchWikidataEntity(qid);
        const p279 = (ent2?.claims?.P279 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
        if (p279.some(id => EVENT_LIKE_QIDS.has(id))) { ok = true; break; }
      }
    }
  }catch{}
  WD_CACHE.set(ck, ok);
  return ok;
}

// Categorías de Wikipedia (señales NYC)
function catKey(lang,title){ return `${lang}:${title}`.toLowerCase(); }
async function belongsToNYCategories(title, lang="en"){
  const key = catKey(lang,title);
  if (CAT_CACHE.has(key)) return CAT_CACHE.get(key);

  let ok = false;
  try{
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=categories&cllimit=500&clshow=!hidden&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const r = await fetch(url);
    if (!r.ok){ CAT_CACHE.set(key,false); return false; }
    const j = await r.json();
    const pages = Object.values(j?.query?.pages || {});
    if (!pages.length){ CAT_CACHE.set(key,false); return false; }
    const cats = (pages[0].categories || []).map(c => (c.title||"").toLowerCase());

    const citySignals = ["new york","manhattan","brooklyn","queens","bronx","staten island","nyc"];
    const historySignals = [
      "history of new york city","cultural history of new york city",
      "events in new york city","festivals in new york city",
      "historia de nueva york","eventos en nueva york","festivales de nueva york",
      "urban planning in new york city","economy of new york city","government of new york city",
      "urbanismo de nueva york","economía de nueva york","gobierno de nueva york"
    ];
    const matchCity   = cats.some(cat => citySignals.some(sig => cat.includes(sig)));
    const matchFacts  = cats.some(cat => historySignals.some(sig => cat.includes(sig)));
    const patternInNY = cats.some(cat => / in new york city\)?$/i.test(cat));

    ok = matchCity || matchFacts || patternInNY;
  }catch{}
  CAT_CACHE.set(key, ok);
  return ok;
}

// Scoring (modo "places" | "facts")
async function nycScore(summary, lang, mode="places"){
  if (!summary) return -999;
  if (isDisambiguation(summary)) return -100;

  let score = 0;
  const c = summary.coordinates;
  if (c && inNycBbox(c.lat, c.lon)) score += 3;

  try{ if (await belongsToNYCategories(summary.title, lang)) score += 3; }catch{}
  try{ if (await wikidataLocatedInNYC(summary.wikibase_item)) score += 5; }catch{}
  try{ if (await wikidataHeldAtNYC(summary.wikibase_item))    score += 4; }catch{}

  if (mode === "facts"){
    try{
      if (await wikidataIsEventLike(summary.wikibase_item)) score += 4;
      else score -= 3;
    }catch{}
  }

  return score;
}

// Imagen (fallbacks)
function pickFromSrcset(srcset=[], targetW=800){
  if (!Array.isArray(srcset) || srcset.length===0) return null;
  const ordered = [...srcset].sort((a,b)=>(a.width||0)-(b.width||0));
  return ordered.find(x => (x.width||0) >= targetW)?.src || ordered[ordered.length-1].src;
}
async function wikidataMainImageUrl(wikibaseId, width = 800){
  if (!wikibaseId) return null;
  try{
    const ent = await fetchWikidataEntity(wikibaseId);
    const p18  = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!p18) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=${width}`;
  }catch{ return null; }
}
async function bestImageUrl({ summary, media, pageImage, wikibaseId }){
  if (media?.items?.length){
    const img = media.items.find(i => i.type==="image" && i.section==="lead")
             || media.items.find(i => i.type==="image");
    const fromSrcset = img && pickFromSrcset(img.srcset, 800);
    if (fromSrcset) return fromSrcset;
    if (img?.src) return img.src;
  }
  if (summary?.originalimage?.source) return summary.originalimage.source;
  if (summary?.thumbnail?.source)    return summary.thumbnail.source;
  if (pageImage?.original?.source)   return pageImage.original.source;
  if (pageImage?.thumbnail?.source)  return pageImage.thumbnail.source;
  const wd = await wikidataMainImageUrl(wikibaseId, 800);
  if (wd) return wd;
  return null;
}

window.NYC_GUARD = {
  isDisambiguation,
  inNycBbox,
  nycScore,       // puntaje NYC con modo
  bestImageUrl,   // fallbacks imagen
};

