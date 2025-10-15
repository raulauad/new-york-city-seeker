(() => {
  // ========= Estado / DOM =========
  let abortCtrl = null;
  let debounce  = null;

  const $q = document.getElementById("q");
  const $go = document.getElementById("go");
  const $status  = document.getElementById("status");
  const $results = document.getElementById("results");

  // Auto-modo (quitamos toggles viejos si existieran)
  document.querySelectorAll(".mode-toggle").forEach(n => n.remove());

  // ========= Toastify wrapper =========
  window.showToast = function (text, type = "info", opts = {}) {
    if (typeof Toastify !== "function") return;
    Toastify({
      text, duration: 3500, close: true,
      gravity: "top", position: "right", stopOnFocus: true,
      className: `toast-${type}`, ...opts
    }).showToast();
  };

  // ========= Endpoints =========
  const summaryUrl  = (l,t) => `https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`;
  const mediaUrl    = (l,t) => `https://${l}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(t)}`;
  const fullHtmlUrl = (l,t) => `https://${l}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=text&formatversion=2&format=json&origin=*`;
  const openSearch  = (l,q) => `https://${l}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json&origin=*`;
  const searchList  = (l,q,limit=12)=>`https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&format=json&origin=*`;
  const pageImagesUrl = (l,t)=>`https://${l}.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(t)}&piprop=thumbnail|original&pithumbsize=800&format=json&origin=*`;

  // Wikidata
  const wdSearchUrl = (q, lang="es", limit=8) =>
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${lang}&uselang=${lang}&type=item&limit=${limit}&format=json&origin=*`;
  const wdEntityUrl = (id) =>
    `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`;
  const WD_NYC_QIDS = ["Q60","Q11299","Q1384","Q18424","Q41079","Q34499"]; // NYC + boroughs
  const WD_HUMAN_QID = "Q5";

  // ========= Cachés =========
  const cache = {
    candidates: new Map(),
    summary:    new Map(), 
    media:      new Map(),
    full:       new Map(),
    pageimg:    new Map(),
  };
  
  const keyLT = (l,t)=>`${l}:${t}`;

  // ========= UI helpers =========
  function setStatus(msg, isError=false){
    $status.textContent = msg;
    $status.classList.toggle("error", !!isError);
  }
  const clearResults = () => { $results.innerHTML = ""; };

  function sanitizeArticleHtml(html){
    const div = document.createElement("div");
    div.innerHTML = html;
    div.querySelectorAll("script, style, iframe, noscript, link").forEach(n => n.remove());
    div.querySelectorAll("*").forEach(el => {
      [...el.attributes].forEach(a => {
        const name = a.name.toLowerCase();
        const val  = (a.value || "").toLowerCase();
        if (name.startsWith("on")) el.removeAttribute(a.name);
        if (name === "style" && /expression|url\s*\(/i.test(val)) el.removeAttribute("style");
      });
    });
    div.querySelectorAll("img").forEach(img => {
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
    });
    return div.innerHTML;
  }

  function renderResult(data){
    clearResults();
    if (!data){
      setStatus("No hay resultados disponibles para tu búsqueda en NYC. Probá reformular (p.ej. 'Conquista de Nueva Ámsterdam', 'First inauguration of George Washington', 'Federal Hall').", true);
      showToast("No hay resultados disponibles para tu búsqueda en NYC.", "warn");
      return;
    }
    const credits = data.attribution
      ? ` · Créditos: ${data.attribution.artist ?? ""}${data.attribution.license ? " · Licencia: "+data.attribution.license : ""}` : "";
    const img = data.imageUrl
      ? `<div class="img-wrap"><img src="${data.imageUrl}" alt="${data.title}" loading="lazy"></div>`
      : `<div class="img-wrap img-empty"></div>`;
    const full = data.fullHtml ? `<div class="article-html">${data.fullHtml}</div>` : "";

    $results.insertAdjacentHTML("afterbegin", `
      <div class="card card-wide">
        ${img}
        <div class="content">
          <h2 class="title">${data.title} ${data.lang ? `<span class="muted">[${data.lang}]</span>` : ""}</h2>
          <div class="desc">${data.description ?? ""}</div>
          <div class="extract">${data.extract ?? ""}</div>
          <div class="meta">
            ${data.pageUrl ? `<a href="${data.pageUrl}" target="_blank" rel="noopener">Ver en Wikipedia</a>` : ""}${credits}
          </div>
          ${full}
        </div>
      </div>
    `);
    setStatus("Listo.");
    showToast(`Mostrando: ${data.title}`, "success");
  }

  // ========= HTTP =========
  async function fetchJSON(url, signal){
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }
  async function fetchSummary(lang, title, signal){
    const k = keyLT(lang,title);
    if (cache.summary.has(k)) return cache.summary.get(k);
    try{
      const r = await fetch(summaryUrl(lang, title), { signal });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      cache.summary.set(k, j);
      return j;
    }catch(e){ if (e.name==="AbortError") throw e; return null; }
  }
  async function fetchMediaList(lang, title, signal){
    const k = keyLT(lang,title);
    if (cache.media.has(k)) return cache.media.get(k);
    try{
      const r = await fetch(mediaUrl(lang, title), { signal });
      if (!r.ok) return null;
      const j = await r.json();
      cache.media.set(k, j);
      return j;
    }catch(e){ if (e.name==="AbortError") throw e; return null; }
  }
  async function fetchFullArticleHtml(lang, title, signal){
    const k = keyLT(lang,title);
    if (cache.full.has(k)) return cache.full.get(k);
    try{
      const j = await fetchJSON(fullHtmlUrl(lang, title), signal);
      const html = (j?.parse?.text) ? sanitizeArticleHtml(j.parse.text) : "";
      cache.full.set(k, html);
      return html;
    }catch(e){ if (e.name==="AbortError") throw e; return ""; }
  }
  async function fetchPageImage(lang, title, signal){
    const k = keyLT(lang,title);
    if (cache.pageimg.has(k)) return cache.pageimg.get(k);
    try{
      const r = await fetch(pageImagesUrl(lang, title), { signal });
      if (!r.ok) return null;
      const j = await r.json();
      const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
      const p = pages[0];
      const out = p ? { original: p.original || null, thumbnail: p.thumbnail || null } : null;
      cache.pageimg.set(k, out);
      return out;
    }catch{ return null; }
  }

  // ========= Idioma =========
  const preferSpanish = (q)=> /[áéíóúñü]/i.test((q||"").trim());
  const langsFor = (q)=> preferSpanish(q) ? ["es","en"] : ["en","es"];

  // ========= Candidatos =========
  const nyMust = `("New York" OR NYC OR Manhattan OR Brooklyn OR Queens OR Bronx OR "Staten Island")`;
  const CIRRUS_CATS = [
    `"History of New York City"`,
    `"Cultural history of New York City"`,
    `"Events in New York City"`,
    `"Festivals in New York City"`,
    `"Urban planning in New York City"`,
    `"Economy of New York City"`,
    `"Government of New York City"`,
    `"Historia de Nueva York"`,
    `"Eventos en Nueva York"`,
    `"Festivales de Nueva York"`,
    `"Urbanismo de Nueva York"`,
    `"Economía de Nueva York"`
  ];
  const EVENT_Q = `haswbstatement:P31=Q1656682`;

  async function fastCandidates(raw, signal){
    const key = `fast:${raw}`;
    if (cache.candidates.has(key)) return cache.candidates.get(key);

    const langs = langsFor(raw);
    const queries = [
      `morelike:"${raw}" ${nyMust}`,
      `intitle:"${raw}" ${nyMust}`,
      `"${raw}" ${nyMust}`,
      `${raw} ${EVENT_Q} ${nyMust}`,
      `${raw} haswbstatement:P131=Q60`,
      `${raw} haswbstatement:P276=Q60`,
      ...CIRRUS_CATS.map(c => `${raw} incategory:${c}`)
    ];

    const seen = new Set();
    const list = [];

    // OpenSearch rápido
    await Promise.all(langs.map(async (lang)=>{
      try{
        const j = await fetchJSON(openSearch(lang, raw), signal);
        const t = (j && Array.isArray(j[1]) && j[1][0]) ? j[1][0] : null;
        if (t){ const k=keyLT(lang,t); if(!seen.has(k)){ seen.add(k); list.push({lang,title:t,source:"open"});} }
      }catch(e){ if (e.name==="AbortError") throw e; }
    }));

    // Cirrus (top-k)
    await Promise.all(langs.map(async (lang)=>{
      for (const q of queries){
        try{
          const j = await fetchJSON(searchList(lang, q, 8), signal);
          const titles = (j?.query?.search ?? []).map(it => it.title);
          for (const t of titles){
            const k = keyLT(lang,t);
            if(!seen.has(k)){ seen.add(k); list.push({lang,title:t,source:"cirrus"}); }
            if (list.length >= 24) break;
          }
        }catch(e){ if (e.name==="AbortError") throw e; }
        if (list.length >= 24) break;
      }
    }));

    cache.candidates.set(key, list);
    return list;
  }

  // ========= Fase PROFUNDA (Wikidata: personas → eventos NYC) =========
  async function detectPersons(raw, signal){
    const langs = langsFor(raw);
    const out = new Set();
    await Promise.all(langs.map(async (L)=>{
      try{
        const j = await fetchJSON(wdSearchUrl(raw, L, 6), signal);
        await Promise.all((j?.search||[]).map(async hit=>{
          const id = hit?.id; if (!id) return;
          try{
            const d = await fetchJSON(wdEntityUrl(id), signal);
            const ent = d?.entities?.[id];
            const p31 = (ent?.claims?.P31 || []).map(c => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
            if (p31.includes(WD_HUMAN_QID)) out.add(id);
          }catch{}
        }));
      }catch(e){ if (e.name==="AbortError") throw e; }
    }));
    return Array.from(out);
  }

  async function sparqlEventsByPerson(personQid, signal){
    const nyVals = WD_NYC_QIDS.map(q => `wd:${q}`).join(" ");
    const query = `
      SELECT ?enTitle ?esTitle WHERE {
        ?item wdt:P31/wdt:P279* wd:Q1656682 .
        { ?item wdt:P276 ?place . } UNION { ?item wdt:P131 ?place . }
        ?place (wdt:P131*) ?ny .
        VALUES ?ny { ${nyVals} }
        ?item wdt:P710 wd:${personQid} .
        OPTIONAL { ?enArticle schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle . }
        OPTIONAL { ?esArticle schema:about ?item ; schema:isPartOf <https://es.wikipedia.org/> ; schema:name ?esTitle . }
      } LIMIT 12`;
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
      { headers: { "Accept": "application/sparql-results+json" }, signal });
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.results?.bindings || []).map(b => ({
      lang: b.esTitle ? "es" : "en",
      title: (b.esTitle?.value || b.enTitle?.value),
      source: "wd-event"
    })).filter(x => x.title);
  }

  function withTimeout(promise, ms, signal){
    let to; const timer = new Promise((_,rej)=>{ to=setTimeout(()=>rej(new Error("timeout")), ms); });
    signal?.addEventListener("abort", ()=>clearTimeout(to), { once:true });
    return Promise.race([promise, timer]).finally(()=>clearTimeout(to));
  }

  async function deepCandidates(raw, signal){
    const key = `deep:${raw}`;
    if (cache.candidates.has(key)) return cache.candidates.get(key);
    const persons = await withTimeout(detectPersons(raw, signal), 1200, signal);
    const collected = [];
    if (persons && persons.length){
      await Promise.all(persons.map(async pid=>{
        const evs = await withTimeout(sparqlEventsByPerson(pid, signal), 2000, signal);
        collected.push(...(evs||[]));
      }));
    }
    cache.candidates.set(key, collected);
    return collected;
  }

  // ========= Score NYC (con bono para eventos SPARQL) =========
  const WD_EVENT_BONUS = 3;
  async function scoreNY(summary, lang, source){
    const guard = window.NYC_GUARD;
    const sF = await guard.nycScore(summary, lang, "facts");
    const sP = await guard.nycScore(summary, lang, "places");
    let sc = Math.max(sF, sP);
    if (source === "wd-event") sc += WD_EVENT_BONUS;
    return sc;
  }

  async function resolveNYCArticle(query, signal){
    const guard = window.NYC_GUARD;
    if (!guard) throw new Error("Guardrail NYC no disponible.");

    // FASE RÁPIDA
    let cands = await withTimeout(fastCandidates(query, signal), 1200, signal);
    cands = (cands || []).slice(0, 24);

    let best = { summary:null, lang:null, score:-999 };
    for (const c of cands){
      const s = await fetchSummary(c.lang, c.title, signal);
      if (!s) continue;
      const sc = await scoreNY(s, c.lang, c.source);
      if (sc > best.score) best = { summary:s, lang:c.lang, score:sc };
      if (best.score >= 7) break;
    }
    if (best.summary && best.score >= 6) return best;

    // FASE PROFUNDA (con timeouts)
    try{
      const deep = await withTimeout(deepCandidates(query, signal), 2500, signal);
      for (const c of (deep || [])){
        const s = await fetchSummary(c.lang, c.title, signal);
        if (!s) continue;
        const sc = await scoreNY(s, c.lang, c.source);
        if (sc > best.score) best = { summary:s, lang:c.lang, score:sc };
        if (best.score >= 6) break;
      }
    }catch{/* timeout silencioso */}

    if (!best.summary) return { summary:null, lang:null };
    if (best.score < 4) return { summary:null, lang:null };
    return best;
  }

  // ========= Controlador principal =========
  async function searchPlace(raw, trigger = "auto"){ // "auto": tipeo | "submit": click/Enter
    const query = (raw || "").trim();
    clearResults();

    if (query.length < 2){
      setStatus("Escribe al menos 2 letras…");
      if (trigger === "submit") showToast("Mínimo 2 letras para buscar.", "warn");
      return;
    }

    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const { signal } = abortCtrl;

    setStatus("Buscando…");
    if (trigger === "submit") showToast(`Buscando “${query}”…`, "info");

    try{
      const { summary, lang } = await resolveNYCArticle(query, signal);

      if (!summary){
        setStatus("No hay resultados disponibles para tu búsqueda en NYC. Probá reformular (p.ej. 'Conquista de Nueva Ámsterdam', 'First inauguration of George Washington', 'Federal Hall').", true);
        if (trigger === "submit") showToast("No hay resultados disponibles para tu búsqueda en NYC.", "warn");
        return;
      }

      // Media + imagen con fallbacks
      const [media, pageImg] = await Promise.all([
        fetchMediaList(lang, summary.title, signal),
        fetchPageImage(lang, summary.title, signal),
      ]);
      const imageUrl = await window.NYC_GUARD.bestImageUrl({
        summary, media, pageImage: pageImg, wikibaseId: summary.wikibase_item
      });

      // Artículo completo (HTML)
      const fullHtml = await fetchFullArticleHtml(lang, summary.title, signal);

      // Atribución
      let attribution = null;
      if (media?.items?.length){
        const img = media.items.find(i => i.type==="image" && i.section==="lead")
                 || media.items.find(i => i.type==="image");
        if (img){
          attribution = { artist: img.artist?.html || null, license: img.license || null, source: img.file_page || null };
        }
      }

      renderResult({
        title: summary.title,
        description: summary.description,
        extract: summary.extract,
        pageUrl: summary.content_urls?.desktop?.page,
        imageUrl, attribution, lang, fullHtml
      });
    }catch(e){
      // Silenciar abort/timeout para evitar falsos “revisá la conexión”
      if (e.name === "AbortError" || e.message === "timeout") return;
      setStatus(e.message || "Error desconocido", true);
      if (trigger === "submit") showToast("No se pudo cargar la información. Revisá tu conexión.", "error");
    }
  }

  // ========= Eventos =========
  $go?.addEventListener("click", () => searchPlace($q.value, "submit"));
  $q?.addEventListener("keydown", (e) => { if (e.key === "Enter") searchPlace($q.value, "submit"); });
  $q?.addEventListener("input", (e) => {
    clearTimeout(debounce);
    const v = e.target.value;
    if (v.trim().length < 2) { setStatus("Escribe al menos 2 letras…"); return; }
    debounce = setTimeout(() => searchPlace(v, "auto"), 450);
  });

  // // Para probar rápido:
  // $q.value = "juramentación george washington";
  // searchPlace($q.value, "submit");
})();






