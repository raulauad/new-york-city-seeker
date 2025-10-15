
<h1 style="color:#0D47A1;">New York City Seeker – Documentación General</h1>

<h2 style="color:#1976D2;">Visión General del Proyecto</h2>
<p><strong>New York City Seeker</strong> es una aplicación web estática que permite explorar lugares(Motor de busq v1), relacionados con la ciudad de Nueva York utilizando contenidos de Wikipedia y Wikidata. El proyecto combina un carrusel hero con imágenes icónicas, un motor de búsqueda bilingüe (español/inglés) y una visualización enriquecida del artículo seleccionado.</p>

<h2 style="color:#1976D2;">Últimos Cambios Relevantes</h2>
<ul>
  <li><strong>entrega-final-js</strong>: versión estabilizada con el buscador completo, integración de Toastify y mejoras de estilos oscuros.</li>
  <li><strong>Agrego comentarios explicando la lógica principal del código</strong>: documentación en línea para el componente de carrusel.</li>
  <li><strong>Filtro menunav</strong> y <strong>Inicio dropdown-menu horizontal</strong>: primeras iteraciones sobre la navegación (actualmente deshabilitadas en el HTML).</li>
</ul>

<h2 style="color:#1976D2;">Arquitectura y Estructura de Archivos</h2>
<ul>
  <li><strong>index.html</strong>: punto de entrada; define la estructura de la página, enlaces a hojas de estilo, Toastify y scripts JavaScript.</li>
  <li><strong>Styles/styles.css</strong>: hoja de estilo principal con modo oscuro, gradientes dorados y reglas de adaptación responsive.</li>
  <li><strong>JS/carousel.js</strong>: lógica del carrusel de imágenes hero con reproducción automática y controles manuales.</li>
  <li><strong>JS/app-nyc.js</strong>: “guard rails” para evaluar la relevancia de cada artículo respecto a Nueva York mediante Wikidata y categorías de Wikipedia.</li>
  <li><strong>JS/utilities.js</strong>: controlador principal del buscador; gestiona eventos de UI, solicitudes a APIs, cachés en memoria y renderizado de resultados.</li>
  <li><strong>Assets/</strong>: iconografía y fotografías utilizadas por el carrusel y el buscador.</li>
</ul>

<h2 style="color:#1976D2;">Flujo de Datos</h2>
<ol>
  <li>El usuario ingresa un término en la barra de búsqueda. Un <em>debounce</em> dispara búsquedas automáticas tras 450&nbsp;ms, o inmediatamente al hacer clic en «Buscar».</li>
  <li><code>utilities.js</code> consulta Wikipedia (OpenSearch y CirrusSearch) y Wikidata para generar candidatos relevantes. Los resultados se filtran y puntúan con <code>NYC_GUARD.nycScore</code>.</li>
  <li>El mejor candidato se enriquece con resúmenes, imágenes, contenido HTML completo y metadatos de atribución.</li>
  <li>El componente de UI genera una tarjeta amplia que incluye descripción, extracto, enlace a Wikipedia y el artículo completo adaptado a modo oscuro.</li>
  <li>Toastify muestra estados («Buscando…», «Listo», errores) y el estado textual se actualiza en la interfaz.</li>
</ol>

<h2 style="color:#1976D2;">Dependencias Externas y Servicios</h2>
<ul>
  <li><strong>Toastify.js</strong> (CDN): notificaciones no intrusivas para retroalimentación rápida.</li>
  <li><strong>Wikipedia REST API</strong> (<code>page/summary</code>, <code>media-list</code>, <code>parse</code>, <code>opensearch</code>, <code>search</code>, <code>pageimages</code>): obtención de contenido, imágenes y HTML.</li>
  <li><strong>Wikidata EntityData y SPARQL</strong>: verificación de pertenencia geográfica (propiedades P131/P276), eventos asociados (P31/P279) y consulta de eventos relacionados con personajes.</li>
</ul>

<h2 style="color:#1976D2;">Manual Técnico</h2>
<h3 style="color:#2196F3;">Instalación y Ejecución</h3>
<ol>
  <li>Clonar el repositorio.</li>
  <li>Servir el directorio raíz con cualquier servidor estático (por ejemplo, <code>npx serve .</code>, <code>python -m http.server</code> o la vista “Go Live” de VS Code).</li>
  <li>Abrir <code>http://localhost:PORT/index.html</code> en un navegador moderno (Chrome, Firefox, Edge o Safari con soporte para <code>fetch</code> y ES6).</li>
</ol>

<h3 style="color:#2196F3;">Componentes Clave</h3>
<ul>
  <li><strong>Debounce y AbortController</strong> en <code>utilities.js</code> evitan peticiones redundantes y cancelan búsquedas en curso al teclear rápidamente.</li>
  <li><strong>Cachés in-memory</strong> (Map) minimizan el tráfico a Wikipedia/Wikidata y reducen el tiempo de respuesta.</li>
  <li><strong>Guard rails de relevancia</strong> (<code>NYC_GUARD</code>) calculan un puntaje que combina coordenadas, categorías, propiedades de Wikidata y pertenencia a eventos.</li>
  <li><strong>Renderizado seguro</strong>: el HTML completo de Wikipedia se sanitiza para remover scripts, estilos embebidos inseguros y atributos sospechosos.</li>
  <li><strong>Responsive design</strong>: <code>styles.css</code> adapta tarjetas, tablas e infoboxes a pantallas medianas y móviles, forzando modo oscuro coherente.</li>
</ul>

<h3 style="color:#2196F3;">Puntos de Extensión</h3>
<ul>
  <li>Agregar un selector de modo “lugares”/“eventos” reutilizando <code>nycScore</code> con los modos existentes.</li>
  <li>Persistir historial de búsquedas en <code>localStorage</code> o integrarlo con un backend ligero para analítica.</li>
  <li>Incorporar pruebas unitarias con Jest para funciones puras (<code>inNycBbox</code>, <code>isDisambiguation</code>) y pruebas de integración con Playwright para los flujos críticos.</li>
</ul>

<h3 style="color:#2196F3;">Guía de Mantenimiento</h3>
<ul>
  <li>Controlar periódicamente el límite de tasa de las APIs de Wikipedia y Wikidata (429 o 503); implementar reintentos exponenciales si fuese necesario.</li>
  <li>Validar cambios de CORS: si se mueve a un backend, proxyear las solicitudes para evitar bloqueos.</li>
  <li>Actualizar Toastify mediante CDN versionado para asegurar compatibilidad y evitar <em>breaking changes</em>.</li>
  <li>Optimizar el directorio <code>Assets/</code> convirtiendo imágenes pesadas a WebP para mejorar tiempos de carga.</li>
</ul>

<h2 style="color:#1976D2;">Manual de Usuario</h2>
<h3 style="color:#2196F3;">Primeros Pasos</h3>
<ol>
  <li>Accede a la aplicación. El carrusel te mostrará imágenes representativas de Nueva York.</li>
  <li>Localiza la barra «New York City Seeker» y escribe un término relacionado (ej.: “Brooklyn Bridge”, "Manhattan").</li>
</ol>

<h3 style="color:#2196F3;">Interpretar los Resultados</h3>
<ul>
  <li>La tarjeta principal incluye título, descripción, imagen destacada y extracto del artículo.</li>
  <li>El enlace «Ver en Wikipedia» abre el artículo original en una pestaña nueva.</li>
  <li>El cuerpo del artículo se renderiza directamente en la tarjeta con formato oscuro y tablas adaptadas.</li>
  <li>El área de estado bajo la barra de búsqueda indicará “Buscando…”, “Listo.” o mensajes de error.</li>
  <li>Notificaciones emergentes (Toastify) refuerzan la retroalimentación (éxito, advertencia o error).</li>
</ul>

<h3 style="color:#2196F3;">Buenas Prácticas de Búsqueda</h3>
<ul>
  <li>Si no encuentras resultados, reformula con sinónimos o agrega nombres de barrios/distritos.</li>
</ul>

<h3 style="color:#2196F3;">Solución de Problemas</h3>
<ul>
  <li><strong>Sin resultados</strong>: verifica la conexión e intenta con un término más específico.</li>
  <li><strong>Errores HTTP</strong>: espera unos segundos; los servicios de Wikipedia/Wikidata pueden aplicar límites de tasa temporalmente.</li>
  <li><strong>Imágenes ausentes</strong>: algunos artículos no cuentan con medios; el sistema intenta múltiples fuentes, pero podría no existir imagen disponible.</li>
</ul>

<h2 style="color:#1976D2;">Actualizaciones a futuro</h2>
<ul>
  <li>Agregar analítica anónima para comprender términos populares.</li>
  <li>Implementar almacenamiento offline básico (Service Worker) para caché de assets y resultados recientes.</li>
  <li>Permitir compartir tarjetas mediante enlaces profundos con el término consultado.</li>
</ul>

<h2 style="color:#1976D2;">Licencia y Créditos</h2>
<p>El contenido de Wikipedia y Wikimedia Commons se rige por sus respectivas licencias Creative Commons..</p>
