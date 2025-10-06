// --- Guardrail NYC y helpers imagen (expuestos en window.NYC_GUARD) ---
// Sin listas hardcodeadas: usamos Wikidata (P131), Categorías y Coordenadas.

const NYC_BBOX = { minLat: 40.40, maxLat: 41.05, minLon: -74.30, maxLon: -73.60 };

// Wikidata QIDs: NYC y boroughs
const NYC_QIDS = new Set(["Q60","Q11299","Q1384","Q18424","Q41079","Q34499"]);

const WD_CACHE  = new Map();   // cache P131
const CAT_CACHE = new Map();   // cache categorías

const inNycBbox = (lat,lon) =>
  typeof lat==="number" && typeof lon==="number" &&
  lat>=NYC_BBOX.minLat && lat<=NYC_BBOX.maxLat &&
  lon>=NYC_BBOX.minLon && lon<=NYC_BBOX.maxLon;

function isDisambiguation(summary){
  const d = (summary?.description||"") + " " + (summary?.type||"");
  return /desambiguaci[oó]n|disambiguation/i.test(d);
}

// ---------- Wikidata: ¿está ubicado administrativamente en NYC? ----------
async function wikidataLocatedInNYC(wikibaseId){
  if (!wikibaseId) return false;
  if (WD_CACHE.has(wikibaseId)) return WD_CACHE.get(wikibaseId);

  let ok = false;
  try{
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wikibaseId)}.json`;
    const res = await fetch(url);
    if (!res.ok) { WD_CACHE.set(wikibaseId,false); return false; }
    const data = await res.json();
    const ent = data?.entities?.[wikibaseId];

    const p131 = (ent?.claims?.P131 || [])
      .map(c => c?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);

    if (p131.some(id => NYC_QIDS.has(id))) ok = true;

    // Subir un nivel por si pertenece a un barrio dentro de un borough
    if (!ok){
      for (const qid of p131){
        try{
          const r2 = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
          if (!r2.ok) continue;
          const d2 = await r2.json();
          const p131b = (d2?.entities?.[qid]?.claims?.P131 || [])
            .map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
          if (p131b.some(id => NYC_QIDS.has(id))) { ok = true; break; }
        }catch{}
      }
    }
  }catch{}
  WD_CACHE.set(wikibaseId, ok);
  return ok;
}

// ---------- Wikipedia Categories: ¿pertenece a categorías de NYC? ----------
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
    const categories = (pages[0].categories || []).map(c => (c.title||"").toLowerCase());

    // Señales de NYC: ciudad o boroughs en categorías
    const SIGNALS = ["new york","manhattan","brooklyn","queens","bronx","staten island","nyc"];
    ok = categories.some(cat => SIGNALS.some(sig => cat.includes(sig)));
  }catch{}
  CAT_CACHE.set(key, ok);
  return ok;
}

// ---------- Scoring dinámico NYC ----------
async function nycScore(summary, lang){
  if (!summary) return -999;
  if (isDisambiguation(summary)) return -100;  // nunca aceptamos desambiguación

  let score = 0;

  // Coordenadas dentro del BBox
  const c = summary.coordinates;
  if (c && inNycBbox(c.lat, c.lon)) score += 3;

  // Categorías
  try{
    if (await belongsToNYCategories(summary.title, lang)) score += 4;
  }catch{}

  // Wikidata P131 (más fuerte)
  try{
    if (await wikidataLocatedInNYC(summary.wikibase_item)) score += 6;
  }catch{}

  return score;
}

// ---------- Imagen: fallbacks (media-list → summary → pageimages → Wikidata P18) ----------
function pickFromSrcset(srcset=[], targetW=800){
  if (!Array.isArray(srcset) || srcset.length===0) return null;
  const ordered = [...srcset].sort((a,b)=>(a.width||0)-(b.width||0));
  return ordered.find(x => (x.width||0) >= targetW)?.src || ordered[ordered.length-1].src;
}

// P18 de Wikidata (archivo en Commons)
async function wikidataMainImageUrl(wikibaseId, width = 800){
  if (!wikibaseId) return null;
  try{
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wikibaseId)}.json`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const ent  = data?.entities?.[wikibaseId];
    const p18  = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!p18) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=${width}`;
  }catch{ return null; }
}

async function bestImageUrl({ summary, media, pageImage, wikibaseId }){
  // media-list
  if (media?.items?.length){
    const img = media.items.find(i => i.type==="image" && i.section==="lead")
             || media.items.find(i => i.type==="image");
    const fromSrcset = img && pickFromSrcset(img.srcset, 800);
    if (fromSrcset) return fromSrcset;
    if (img?.src) return img.src;
  }
  // summary
  if (summary?.originalimage?.source) return summary.originalimage.source;
  if (summary?.thumbnail?.source)    return summary.thumbnail.source;
  // pageimages
  if (pageImage?.original?.source) return pageImage.original.source;
  if (pageImage?.thumbnail?.source) return pageImage.thumbnail.source;
  // wikidata P18
  const wd = await wikidataMainImageUrl(wikibaseId, 800);
  if (wd) return wd;

  return null;
}

window.NYC_GUARD = {
  isDisambiguation,
  inNycBbox,
  nycScore,       // puntaje NYC (P131 + categorías + coords)
  bestImageUrl,   // mejor estrategia de imagen con fallbacks
};
