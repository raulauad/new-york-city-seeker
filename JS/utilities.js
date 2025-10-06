(() => {
  // ---- Estado/DOM ----
  let abortCtrl = null;
  let debounce  = null;

  const $q = document.getElementById("q");
  const $status = document.getElementById("status");
  const $results = document.getElementById("results");

  // ---- URLs ----
  const summaryUrl  = (lang,title) =>
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const mediaUrl    = (lang,title) =>
    `https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`;
  // Artículo completo (HTML parseado)
  const fullHtmlUrl = (lang,title) =>
    `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json&origin=*`;
  // OpenSearch y búsqueda
  const openSearch  = (lang,q) =>
    `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json&origin=*`;
  const searchList  = (lang,q,limit=10) =>
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&format=json&origin=*`;
  // PageImages (para obtener thumbnails/originales cuando no hay media/summary)
  const pageImagesUrl = (lang,title) =>
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&piprop=thumbnail|original&pithumbsize=800&format=json&origin=*`;

  // ---- Helpers UI ----
  function setStatus(msg, isError=false){
    $status.textContent = msg;
    $status.classList.toggle("error", !!isError);
  }
  function clearResults(){ $results.innerHTML = ""; }

  function renderResult(data){
    const credits = data.attribution
      ? ` · Créditos: ${data.attribution.artist ?? ""}${data.attribution.license ? " · Licencia: "+data.attribution.license : ""}`
      : "";

    const img = data.imageUrl
      ? `<div class="img-wrap"><img src="${data.imageUrl}" alt="${data.title}" loading="lazy"></div>`
      : `<div class="img-wrap img-empty"></div>`;

    const fullArticle = data.fullHtml
      ? `<div class="article-html">${data.fullHtml}</div>`
      : `<div class="article-html"><p>No se pudo cargar el artículo completo.</p></div>`;

    const html = `
      <div class="card card-wide">
        ${img}
        <div class="content">
          <h2 class="title">${data.title} ${data.lang ? `<span class="muted">[${data.lang}]</span>` : ""}</h2>
          <div class="desc">${data.description ?? ""}</div>
          <div class="extract">${data.extract ?? ""}</div>
          <div class="meta">
            ${data.pageUrl ? `<a href="${data.pageUrl}" target="_blank" rel="noopener">Ver en Wikipedia</a>` : ""}${credits}
          </div>
          ${fullArticle}
        </div>
      </div>`;
    $results.insertAdjacentHTML("beforeend", html);
    setStatus("Listo.");
  }

  // ---- HTTP ----
  async function fetchJSON(url, signal){
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }
  async function fetchSummary(lang, title, signal){
    try{
      const r = await fetch(summaryUrl(lang, title), { signal });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(e){ if (e.name==="AbortError") throw e; return null; }
  }
  async function fetchFullArticleHtml(lang, title, signal){
    try{
      const j = await fetchJSON(fullHtmlUrl(lang, title), signal);
      return (j?.parse?.text) ? sanitizeArticleHtml(j.parse.text) : "";
    }catch(e){ if (e.name==="AbortError") throw e; return ""; }
  }
  async function fetchPageImage(lang, title, signal){
    try{
      const r = await fetch(pageImagesUrl(lang, title), { signal });
      if (!r.ok) return null;
      const j = await r.json();
      const pages = j?.query?.pages ? Object.values(j.query.pages) : [];
      const p = pages[0];
      if (!p) return null;
      return { original: p.original || null, thumbnail: p.thumbnail || null };
    }catch{ return null; }
  }

  // ---- Saneado mínimo del HTML (evita scripts/iframes/etc.)
  function sanitizeArticleHtml(html){
    const div = document.createElement("div");
    div.innerHTML = html;

    // Quitar elementos problemáticos
    div.querySelectorAll("script, style, iframe, noscript, link").forEach(n => n.remove());

    // Quitar atributos peligrosos
    div.querySelectorAll("*").forEach(el => {
      [...el.attributes].forEach(a => {
        const name = a.name.toLowerCase();
        const val  = (a.value || "").toLowerCase();
        if (name.startsWith("on")) el.removeAttribute(a.name); // onclick, etc
        if (name === "style" && /expression|url\s*\(/i.test(val)) el.removeAttribute("style");
      });
    });

    // Reescalar imágenes dentro del artículo
    div.querySelectorAll("img").forEach(img => {
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
    });

    return div.innerHTML;
  }

  // ---- OpenSearch / query search ----
  async function openSearchTitle(lang, query, signal){
    try{
      const j = await fetchJSON(openSearch(lang, query), signal);
      return (j && Array.isArray(j[1]) && j[1][0]) ? j[1][0] : null;
    }catch(e){ if (e.name==="AbortError") throw e; return null; }
  }
  async function searchTitles(lang, query, limit, signal){
    try{
      const j = await fetchJSON(searchList(lang, query, limit), signal);
      return (j?.query?.search ?? []).map(it => it.title);
    }catch(e){ if (e.name==="AbortError") throw e; return []; }
  }

  // ---- Heurística de idioma (para priorizar enwiki cuando la query está en inglés)
  function preferEnglish(q){
    const s = q.trim();
    if (/[áéíóúñü]/i.test(s)) return false;
    return /\b(the|of|in|at|and)\b/i.test(s);
  }

  // ---- Generación de candidatos (sin listas manuales) ----
  async function* candidateStream(raw, signal){
    const primary = preferEnglish(raw) ? "en" : "es";
    const secondary = primary === "en" ? "es" : "en";

    const seen = new Set();
    const push = (lang,title) => {
      const k = `${lang}:${title}`;
      if (!seen.has(k)){ seen.add(k); return {lang,title}; }
      return null;
    };

    // A) OpenSearch en ambos idiomas con variantes NY
    for (const lang of [primary, secondary]){
      for (const q of [
        raw,
        `${raw} New York`,
        `${raw} NYC`,
        `${raw} Manhattan`,
        `${raw} (New York)`,
        `${raw} (Nueva York)`
      ]){
        const t = await openSearchTitle(lang, q, signal);
        if (t){ const c = push(lang,t); if (c) yield c; }
      }
    }

    // B) Búsqueda dirigida con obligación de NY/borough en la query
    const nyMust = `("New York" OR NYC OR Manhattan OR Brooklyn OR Queens OR Bronx OR "Staten Island")`;
    const queries = [
      `intitle:"${raw}" ${nyMust}`,
      `"${raw}" ${nyMust}`,
      `${raw} ${nyMust}`
    ];

    for (const lang of [primary, secondary]){
      for (const q of queries){
        const titles = await searchTitles(lang, q, 20, signal);
        for (const t of titles){ const c = push(lang,t); if (c) yield c; }
      }
    }
  }

  // ---- Selección por score NYC ----
  async function findNySummary(query, signal){
    const guard = window.NYC_GUARD;
    if (!guard) throw new Error("Guardrail NYC no disponible");

    let best = { summary:null, lang:null, score:-999 };

    for await (const cand of candidateStream(query, signal)){
      const s = await fetchSummary(cand.lang, cand.title, signal);
      if (!s) continue;

      const sc = await guard.nycScore(s, cand.lang);
      if (sc > best.score){
        best = { summary: s, lang: cand.lang, score: sc };
      }
      // Umbral mínimo para aceptar (ajustable)
      if (best.score >= 4) break;
    }

    if (best.score < 4) return { summary:null, lang:null };
    return { summary: best.summary, lang: best.lang };
  }

  // ---- Controlador principal ----
  async function buscarLugar(raw){
    const query = (raw || "").trim();
    clearResults();

    if (query.length < 2){
      setStatus("Escribe un término (ej.: met, moma, brooklyn).");
      return;
    }

    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const { signal } = abortCtrl;

    setStatus("Buscando…");

    try{
      const { summary, lang } = await findNySummary(query, signal);

      if (!summary){
        setStatus("No encontré un artículo que esté claramente relacionado con la ciudad de Nueva York.", true);
        return;
      }

      // Media (imagen/atribución)
      let media = null;
      try {
        const m = await fetch(mediaUrl(lang, summary.title), { signal });
        if (m.ok) media = await m.json();
      } catch {}

      // PageImages (fallback) y BEST image (usa también Wikidata P18)
      const pageImg = await fetchPageImage(lang, summary.title, signal);
      const imageUrl = await window.NYC_GUARD.bestImageUrl({
        summary,
        media,
        pageImage: pageImg,
        wikibaseId: summary.wikibase_item
      });

      // Artículo completo (HTML)
      const fullHtml = await fetchFullArticleHtml(lang, summary.title, signal);

      // Atribución básica (si existe)
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
        imageUrl,
        attribution,
        lang,
        fullHtml
      });
    }catch(e){
      if (e.name === "AbortError") return;
      setStatus(e.message || "Error desconocido", true);
    }
  }

  // ---- Eventos ----
  document.getElementById("go").addEventListener("click", () => buscarLugar($q.value));
  $q.addEventListener("keydown", (e) => { if (e.key === "Enter") buscarLugar($q.value); });
  $q.addEventListener("input", (e) => {
    clearTimeout(debounce);
    const v = e.target.value;
    if (v.trim().length < 2) { setStatus("Escribe al menos 2 letras…"); return; }
    debounce = setTimeout(() => buscarLugar(v), 500);
  });

  // Demo opcional:
  // $q.value = "the met";
  // buscarLugar($q.value);
})();

