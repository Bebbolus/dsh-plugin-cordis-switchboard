/**
 * dsh-plugin-cordis-switchboard
 * Cordis Plugin per DeepSeek Harness (DSH)
 * Gestore Universale di Toggle per TUTTI i plugin e tool Cordis.
 * Supporta:
 * - Attivazione/Disattivazione a livello di SINGOLA SESSIONE (per-session state)
 * - Commutazione dinamica tra turni consecutivi nella stessa conversazione
 * - Ricerca libera (search) di plugin e tool per nome, descrizione e categoria
 * - Protezione dei plugin CORE (non disattivabili per garantire stabilità del kernel)
 * - Potatura deterministica (Dynamic Tool Pruning) con stima del risparmio di token
 * - Dashboard visuale HTML interattiva (.dsh/tasks/switchboard.html)
 */

import { promises as fs } from 'fs';
import path from 'path';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const SWITCHES_FILE = path.join(WORKSPACE_DIR, '.dsh', 'switches.json');
const SWITCHBOARD_HTML = path.join(WORKSPACE_DIR, '.dsh', 'tasks', 'switchboard.html');

// Plugin essenziali del microkernel Cordis / DSH (protetti: non possono essere disattivati)
const CORE_PROTECTED_PLUGINS = new Set([
  'cordis',
  'cordis:include',
  'connection',
  'webserver',
  'apiProxy',
  'session',
  'workspace',
  'uiRenderer',
  'dsh-tools',
  'tool-fs',
  'tool-bash',
  'tool-str-replace-editor'
]);

/**
 * Carica l'intero albero di configurazione da disco
 */
async function loadSwitchesData() {
  try {
    const data = await fs.readFile(SWITCHES_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return {
      global: parsed.global || { disabled_plugins: [], disabled_tools: [], providers: { web_search: 'searxng' } },
      sessions: parsed.sessions || {}
    };
  } catch {
    return {
      global: {
        disabled_plugins: [],
        disabled_tools: [],
        providers: {
          web_search: 'searxng' // 'searxng' | 'default' | 'disabled'
        }
      },
      sessions: {}
    };
  }
}

/**
 * Salva l'albero di configurazione su disco
 */
async function saveSwitchesData(data) {
  try {
    await fs.mkdir(path.dirname(SWITCHES_FILE), { recursive: true });
    await fs.writeFile(SWITCHES_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[cordis-switchboard] Errore salvataggio switches.json: ${err.message}`);
  }
}

/**
 * Risolve la configurazione effettiva per una data sessione
 */
function resolveSessionConfig(data, sessionId = 'default') {
  const sessionConfig = data.sessions[sessionId] || {
    disabled_plugins: [],
    disabled_tools: [],
    providers: { ...data.global.providers }
  };

  return {
    sessionId,
    disabled_plugins: new Set([...(data.global.disabled_plugins || []), ...(sessionConfig.disabled_plugins || [])]),
    disabled_tools: new Set([...(data.global.disabled_tools || []), ...(sessionConfig.disabled_tools || [])]),
    providers: {
      ...data.global.providers,
      ...(sessionConfig.providers || {})
    }
  };
}

/**
 * Scansiona e restituisce il catalogo completo di TUTTI i plugin e tool Cordis rilevati
 */
async function discoverAllCordisComponents(ctx, sessionConfig) {
  const items = new Map();

  // 1. Introspezione entries di Cordis Loader (se disponibili)
  try {
    const loader = ctx.loader || (ctx.app && ctx.app.loader);
    if (loader && typeof loader.entries === 'function') {
      for (const entry of loader.entries()) {
        const name = entry.options?.name || entry.id;
        if (name && !items.has(name)) {
          const isCore = CORE_PROTECTED_PLUGINS.has(name);
          items.set(name, {
            name,
            type: 'plugin',
            category: isCore ? 'core' : (name.startsWith('dsh-plugin-') ? 'community_plugin' : 'system_plugin'),
            description: `Plugin Cordis montato nel profilo runtime (${isCore ? 'Kernel Core' : 'Estensione Dinamica'})`,
            is_core: isCore,
            token_weight: isCore ? 0 : 500,
            enabled: isCore ? true : !sessionConfig.disabled_plugins.has(name)
          });
        }
      }
    }
  } catch {}

  // 2. Introspezione Tools registrati in ctx.tools
  try {
    const toolMap = ctx.tools?._tools || ctx.tools?.tools || {};
    if (typeof toolMap.forEach === 'function') {
      toolMap.forEach((tool, key) => {
        const name = tool.name || key;
        const isCore = CORE_PROTECTED_PLUGINS.has(name);
        if (!items.has(name)) {
          items.set(name, {
            name,
            type: 'tool',
            category: isCore ? 'core' : (name.includes('search') || name.includes('web') ? 'search' : 'agentic'),
            description: tool.description || 'Tool operativo registrato in Cordis',
            is_core: isCore,
            token_weight: 400,
            enabled: isCore ? true : !sessionConfig.disabled_tools.has(name)
          });
        }
      });
    } else if (typeof toolMap === 'object') {
      for (const [key, tool] of Object.entries(toolMap)) {
        const name = (tool && tool.name) || key;
        const isCore = CORE_PROTECTED_PLUGINS.has(name);
        if (!items.has(name)) {
          items.set(name, {
            name,
            type: 'tool',
            category: isCore ? 'core' : (name.includes('search') || name.includes('web') ? 'search' : 'agentic'),
            description: (tool && tool.description) || 'Tool operativo registrato in Cordis',
            is_core: isCore,
            token_weight: 400,
            enabled: isCore ? true : !sessionConfig.disabled_tools.has(name)
          });
        }
      }
    }
  } catch {}

  // 3. Catalogo di base e community packages (SearXNG, Agent-Reach, Architect, Sidebar, ecc.)
  const knownCommunityCatalog = [
    { name: 'dsh-plugin-searxng', type: 'plugin', category: 'search', description: 'Meta-motore di ricerca OSINT privato SearXNG (Michael Bazzell)', token_weight: 600 },
    { name: 'agent-reach', type: 'skill', category: 'community', description: 'OSINT Multi-Canale per YouTube, Social, Wayback Machine e Scraping', token_weight: 700 },
    { name: 'dsh-plugin-the-architect', type: 'plugin', category: 'agentic', description: 'ICM Meta-Orchestrator, Triage Fable Loop e Zero-Token Handoff', token_weight: 1200 },
    { name: 'dsh-plugin-plan-sidebar', type: 'plugin', category: 'agentic', description: 'Dashboard visuale interattiva di avanzamento task in tempo reale', token_weight: 400 },
    { name: 'dsh-plugin-npm-guard', type: 'plugin', category: 'coding', description: 'Guardrail di sicurezza deterministico per audit pacchetti NPM', token_weight: 350 },
    { name: 'docker_runner_exec', type: 'tool', category: 'coding', description: 'Compilazione ed esecuzione effimera on-demand (Go, Rust, Python, Expo)', token_weight: 800 },
    { name: 'tool-web', type: 'tool', category: 'search', description: 'Client di navigazione e ricerca web standard di DeepSeek Harness', token_weight: 500 },
    { name: 'tool-subagent', type: 'tool', category: 'agentic', description: 'Spawning e orchestrazione di sub-agenti isolati a zero token', token_weight: 700 },
    { name: 'tool-goal', type: 'tool', category: 'agentic', description: 'Driver di avanzamento continuo per goal e milestone a lungo termine', token_weight: 500 },
    { name: 'tool-ralph', type: 'tool', category: 'agentic', description: 'Sub-agent loop multi-round con budget fino a 64 iterazioni', token_weight: 650 },
    { name: 'tool-todo', type: 'tool', category: 'agentic', description: 'Gestione parallela della lista task e todo di sessione', token_weight: 350 }
  ];

  for (const comp of knownCommunityCatalog) {
    if (!items.has(comp.name)) {
      items.set(comp.name, {
        ...comp,
        is_core: false,
        enabled: !sessionConfig.disabled_plugins.has(comp.name) && !sessionConfig.disabled_tools.has(comp.name)
      });
    }
  }

  // 4. Aggiungi componenti Core essenziali se non già mappati
  for (const coreName of CORE_PROTECTED_PLUGINS) {
    if (!items.has(coreName)) {
      items.set(coreName, {
        name: coreName,
        type: 'core',
        category: 'core',
        description: 'Componente essenziale del microkernel Cordis / DSH (Protetto)',
        is_core: true,
        token_weight: 0,
        enabled: true
      });
    }
  }

  return Array.from(items.values());
}

/**
 * Genera la Dashboard HTML completa con Ricerca Live, Filtri e Toggles
 */
function renderSwitchboardHtml(items, providers, sessionId, tokensSaved) {
  const jsonCatalog = JSON.stringify(items);
  const jsonProviders = JSON.stringify(providers);

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cordis Universal Switchboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-4 font-sans antialiased selection:bg-blue-600">
  <div class="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5">
    
    <!-- Top Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-3">
      <div>
        <div class="flex items-center space-x-2">
          <span class="text-2xl">🎛️</span>
          <h1 class="text-base font-bold text-white tracking-wide">Cordis Universal Switchboard</h1>
        </div>
        <p class="text-xs text-slate-400 mt-0.5">Controllo modulare per-sessione & Dynamic Tool Pruning</p>
      </div>
      <div class="flex items-center space-x-2">
        <span class="text-xs px-2.5 py-1 rounded-full bg-blue-950 text-blue-300 border border-blue-800/60 font-mono">
          Sessione: <strong class="text-white">${sessionId}</strong>
        </span>
        <span id="token-badge" class="text-xs px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono">
          -${tokensSaved} Token Pruned
        </span>
      </div>
    </div>

    <!-- Sezione Provider Ricerca Web -->
    <div class="mb-5 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
      <div class="flex items-center justify-between mb-2.5">
        <div class="flex items-center space-x-2">
          <span class="text-sm">🌐</span>
          <h2 class="text-xs font-semibold text-slate-200">Commutatore Provider Ricerca Web</h2>
        </div>
        <span class="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Scelta Dinamica per Turno</span>
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs">
        <button onclick="setWebProvider('searxng')" id="btn-prov-searxng"
          class="py-2 px-3 rounded-lg font-medium border text-center transition-all ${providers.web_search === 'searxng' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}">
          🔍 SearXNG (OSINT Privato)
        </button>
        <button onclick="setWebProvider('default')" id="btn-prov-default"
          class="py-2 px-3 rounded-lg font-medium border text-center transition-all ${providers.web_search === 'default' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}">
          🌍 Ricerca Classica (Default)
        </button>
        <button onclick="setWebProvider('disabled')" id="btn-prov-disabled"
          class="py-2 px-3 rounded-lg font-medium border text-center transition-all ${providers.web_search === 'disabled' ? 'bg-rose-900 border-rose-700 text-rose-100 shadow-lg shadow-rose-900/30' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}">
          🚫 Disattivato (Offline)
        </button>
      </div>
      <p class="text-[11px] text-slate-400 mt-2 italic">
        💡 Esempio pratico: Se SearXNG restituisce risultati insoddisfacenti, commuta su <strong>Ricerca Classica</strong> per la richiesta successiva senza dover riavviare DSH.
      </p>
    </div>

    <!-- Barra di Ricerca e Filtri Categoria -->
    <div class="space-y-2.5 mb-4">
      <div class="relative">
        <input type="text" id="search-input" placeholder="🔍 Cerca plugin, tool o capacità (es: searx, reach, code, bash)..."
          oninput="applyFilters()"
          class="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors">
      </div>

      <!-- Filtri rapidi -->
      <div class="flex flex-wrap gap-1.5 text-[11px]">
        <button onclick="setCategoryFilter('all')" class="cat-pill px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium" data-cat="all">Tutti</button>
        <button onclick="setCategoryFilter('search')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="search">Search & OSINT</button>
        <button onclick="setCategoryFilter('community')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="community">Community / Skills</button>
        <button onclick="setCategoryFilter('agentic')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="agentic">Agentic & Planning</button>
        <button onclick="setCategoryFilter('coding')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="coding">Software Factory</button>
        <button onclick="setCategoryFilter('core')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="core">Core (Protetti)</button>
      </div>
    </div>

    <!-- Lista Componenti Introspezionati -->
    <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
      <div class="px-3.5 py-2 bg-slate-800/40 border-b border-slate-800 text-[11px] font-semibold text-slate-400 flex justify-between">
        <span id="count-label">Componenti rilevati: ${items.length}</span>
        <span>Stato per: ${sessionId}</span>
      </div>
      <div id="items-container" class="divide-y divide-slate-800/60 max-h-80 overflow-y-auto p-1">
        <!-- Render dinamico via JavaScript -->
      </div>
    </div>

    <!-- Footer Informativo -->
    <div class="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
      <div class="flex items-center space-x-2">
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Modifiche persistite in <code>.dsh/switches.json</code></span>
      </div>
      <div class="text-[10px] font-mono text-slate-400">
        Comando: <code>/switchboard toggle &lt;nome&gt;</code>
      </div>
    </div>

  </div>

  <script>
    let catalog = ${jsonCatalog};
    let currentProviders = ${jsonProviders};
    let currentCategory = 'all';
    let searchQuery = '';

    function renderList() {
      const container = document.getElementById('items-container');
      const filtered = catalog.filter(item => {
        const matchesCat = currentCategory === 'all' || item.category === currentCategory || (currentCategory === 'community' && (item.category === 'community' || item.category === 'community_plugin'));
        const matchesQuery = !searchQuery || 
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCat && matchesQuery;
      });

      document.getElementById('count-label').textContent = 'Visualizzati: ' + filtered.length + ' di ' + catalog.length;

      if (filtered.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-xs text-slate-500">Nessun plugin o tool corrispondente alla ricerca.</div>';
        return;
      }

      container.innerHTML = filtered.map(item => {
        const isCore = item.is_core;
        const badgeColor = isCore ? 'bg-amber-950 text-amber-400 border-amber-800/40' : 
          (item.enabled ? 'bg-emerald-950 text-emerald-400 border-emerald-800/40' : 'bg-slate-800 text-slate-400 border-slate-700');

        return \`
          <div class="p-2.5 flex items-center justify-between hover:bg-slate-800/30 transition-colors rounded-lg">
            <div class="pr-3">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-mono font-semibold text-slate-200">\${item.name}</span>
                <span class="text-[9px] px-1.5 py-0.2 rounded border \${badgeColor} font-mono">
                  \${isCore ? 'CORE (PROTETTO)' : (item.enabled ? 'ATTIVO' : 'DISATTIVATO')}
                </span>
                \${!isCore ? \`<span class="text-[9px] text-slate-500 font-mono">-\${item.token_weight} tok</span>\` : ''}
              </div>
              <div class="text-[11px] text-slate-400 mt-0.5">\${item.description}</div>
            </div>
            <div>
              \${isCore ? \`
                <span class="text-[10px] text-slate-600 font-mono italic">Kernel</span>
              \` : \`
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" \${item.enabled ? 'checked' : ''} class="sr-only peer" onchange="toggleItem('\${item.name}', this.checked)">
                  <div class="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              \`}
            </div>
          </div>
        \`;
      }).join('');
    }

    function toggleItem(name, state) {
      const item = catalog.find(i => i.name === name);
      if (item && !item.is_core) {
        item.enabled = state;
        updateTokensBadge();
        renderList();
      }
    }

    function updateTokensBadge() {
      const disabledCount = catalog.filter(i => !i.is_core && !i.enabled).length;
      const saved = disabledCount * 500;
      document.getElementById('token-badge').textContent = '-' + saved + ' Token Pruned';
    }

    function setWebProvider(prov) {
      currentProviders.web_search = prov;
      ['searxng', 'default', 'disabled'].forEach(p => {
        const btn = document.getElementById('btn-prov-' + p);
        if (btn) {
          if (p === prov) {
            btn.className = 'py-2 px-3 rounded-lg font-medium border text-center transition-all ' +
              (p === 'disabled' ? 'bg-rose-900 border-rose-700 text-rose-100 shadow-lg shadow-rose-900/30' : 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30');
          } else {
            btn.className = 'py-2 px-3 rounded-lg font-medium border text-center transition-all bg-slate-800 border-slate-700 text-slate-400 hover:text-white';
          }
        }
      });
    }

    function setCategoryFilter(cat) {
      currentCategory = cat;
      document.querySelectorAll('.cat-pill').forEach(btn => {
        if (btn.getAttribute('data-cat') === cat) {
          btn.className = 'cat-pill px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium';
        } else {
          btn.className = 'cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium';
        }
      });
      renderList();
    }

    function applyFilters() {
      searchQuery = document.getElementById('search-input').value;
      renderList();
    }

    // Inizializzazione al caricamento
    renderList();
  </script>
</body>
</html>`;
}

export const name = 'cordis-switchboard';
export const inject = ['tools'];

export function apply(ctx) {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') return;

  // --------------------------------------------------------------------------
  // TOOL 1: switchboard_search (Ricerca universale di Plugin e Tool)
  // --------------------------------------------------------------------------
  ctx.tools.register({
    name: 'switchboard_search',
    description: 'Cerca tra TUTTI i plugin e tool Cordis disponibili (community, OSINT, search, agentic, core) per nome, descrizione o categoria.',
    parameters: {
      query: { type: 'string', required: true, description: 'Termine di ricerca (es: "searx", "reach", "osint", "bash", "architect")' },
      category: { type: 'string', required: false, description: 'Filtro opzionale per categoria: "all", "search", "community", "agentic", "coding", "core"' },
      session_id: { type: 'string', required: false, description: 'Identificativo della sessione (default: "default")' }
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          matches_count: { type: 'number' },
          results: { type: 'array' }
        }
      },
      render: (v) => JSON.stringify(v, null, 2)
    },
    execute: async (args) => {
      const data = await loadSwitchesData();
      const sessionConfig = resolveSessionConfig(data, args.session_id || 'default');
      const allComponents = await discoverAllCordisComponents(ctx, sessionConfig);

      const q = (args.query || '').toLowerCase();
      const targetCat = args.category || 'all';

      const results = allComponents.filter(c => {
        const matchesQuery = c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
        const matchesCat = targetCat === 'all' || c.category === targetCat || (targetCat === 'community' && (c.category === 'community' || c.category === 'community_plugin'));
        return matchesQuery && matchesCat;
      });

      return {
        query: args.query,
        matches_count: results.length,
        session_id: sessionConfig.sessionId,
        results: results.map(r => ({
          name: r.name,
          type: r.type,
          category: r.category,
          is_core: r.is_core,
          toggleable: !r.is_core,
          enabled_in_session: r.enabled,
          description: r.description
        }))
      };
    }
  });

  // --------------------------------------------------------------------------
  // TOOL 2: switchboard_toggle (Attivazione/Disattivazione per-sessione)
  // --------------------------------------------------------------------------
  ctx.tools.register({
    name: 'switchboard_toggle',
    description: 'Attiva o disattiva un plugin o tool per la sessione corrente (o globalmente), o commuta il provider di ricerca web (searxng vs default).',
    parameters: {
      target_name: { type: 'string', required: true, description: 'Nome esatto del plugin/tool/provider (es: "dsh-plugin-searxng", "agent-reach", "docker_runner_exec", "web_search")' },
      enabled: { type: 'boolean', required: false, description: 'true per attivare, false per disattivare (se omesso inverte lo stato attuale)' },
      provider_value: { type: 'string', required: false, description: 'Per target="web_search": "searxng", "default", o "disabled"' },
      scope: { type: 'string', required: false, description: '"session" (default, per la sessione corrente) o "global"' },
      session_id: { type: 'string', required: false, description: 'Identificativo della sessione (default: "default")' }
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          target: { type: 'string' },
          scope: { type: 'string' },
          session_id: { type: 'string' },
          status: { type: 'string' },
          message: { type: 'string' }
        }
      },
      render: (v) => JSON.stringify(v, null, 2)
    },
    execute: async (args) => {
      const target = args.target_name.trim();
      const scope = args.scope || 'session';
      const sessionId = args.session_id || 'default';

      // 1. Controllo di sicurezza: blocco per i plugin CORE
      if (CORE_PROTECTED_PLUGINS.has(target)) {
        return {
          success: false,
          target,
          scope,
          session_id: sessionId,
          status: 'PROTECTED_CORE',
          message: `Rifiutato: '${target}' è un componente CORE del microkernel Cordis / DSH e non può essere disattivato.`
        };
      }

      const data = await loadSwitchesData();

      // 2. Gestione Commutatore Provider Ricerca Web (SearXNG vs Default)
      if (target === 'web_search' || target === 'search_provider') {
        const val = args.provider_value || (args.enabled === false ? 'default' : 'searxng');
        if (scope === 'session') {
          if (!data.sessions[sessionId]) data.sessions[sessionId] = { disabled_plugins: [], disabled_tools: [], providers: {} };
          data.sessions[sessionId].providers.web_search = val;
          data.sessions[sessionId].updated_at = new Date().toISOString();
        } else {
          data.global.providers.web_search = val;
        }

        await saveSwitchesData(data);
        return {
          success: true,
          target: 'web_search',
          scope,
          session_id: sessionId,
          status: val,
          message: `Provider ricerca web commutato su '${val}' per ${scope === 'session' ? `la sessione ${sessionId}` : 'tutte le sessioni'}.`
        };
      }

      // 3. Gestione Toggle Plugin / Tool generico
      const targetConfig = scope === 'session' ?
        (data.sessions[sessionId] = data.sessions[sessionId] || { disabled_plugins: [], disabled_tools: [], providers: {} }) :
        data.global;

      targetConfig.disabled_plugins = targetConfig.disabled_plugins || [];
      targetConfig.disabled_tools = targetConfig.disabled_tools || [];

      // Determina lo stato target
      const isCurrentlyDisabled = targetConfig.disabled_plugins.includes(target) || targetConfig.disabled_tools.includes(target);
      const shouldEnable = args.enabled !== undefined ? args.enabled : isCurrentlyDisabled;

      if (shouldEnable) {
        // Abilita rimuovendo dalle liste di esclusione
        targetConfig.disabled_plugins = targetConfig.disabled_plugins.filter(p => p !== target);
        targetConfig.disabled_tools = targetConfig.disabled_tools.filter(t => t !== target);
      } else {
        // Disabilita inserendo nella lista
        if (target.startsWith('tool-') || target === 'docker_runner_exec') {
          if (!targetConfig.disabled_tools.includes(target)) targetConfig.disabled_tools.push(target);
        } else {
          if (!targetConfig.disabled_plugins.includes(target)) targetConfig.disabled_plugins.push(target);
        }
      }

      if (scope === 'session') {
        targetConfig.updated_at = new Date().toISOString();
      }

      await saveSwitchesData(data);

      return {
        success: true,
        target,
        scope,
        session_id: sessionId,
        status: shouldEnable ? 'ENABLED' : 'DISABLED',
        message: `Componente '${target}' ${shouldEnable ? 'ABILITATO' : 'DISABILITATO'} con successo per ${scope === 'session' ? `la sessione ${sessionId}` : 'tutte le sessioni'}. Dynamic Tool Pruning attivo.`
      };
    }
  });

  // --------------------------------------------------------------------------
  // TOOL 3: switchboard_status (Stato riepilogativo universale)
  // --------------------------------------------------------------------------
  ctx.tools.register({
    name: 'switchboard_status',
    description: 'Visualizza lo stato completo di tutti i toggle, provider attivi e token risparmiati per la sessione corrente.',
    parameters: {
      session_id: { type: 'string', required: false, description: 'Identificativo della sessione (default: "default")' }
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          web_search_provider: { type: 'string' },
          total_components: { type: 'number' },
          disabled_count: { type: 'number' },
          tokens_saved: { type: 'number' },
          components: { type: 'array' }
        }
      },
      render: (v) => JSON.stringify(v, null, 2)
    },
    execute: async (args) => {
      const data = await loadSwitchesData();
      const sessionId = args.session_id || 'default';
      const sessionConfig = resolveSessionConfig(data, sessionId);
      const components = await discoverAllCordisComponents(ctx, sessionConfig);

      const nonCoreDisabled = components.filter(c => !c.is_core && !c.enabled);
      const tokensSaved = nonCoreDisabled.length * 500;

      return {
        session_id: sessionId,
        web_search_provider: sessionConfig.providers.web_search,
        total_components: components.length,
        disabled_count: nonCoreDisabled.length,
        tokens_saved: tokensSaved,
        components: components.map(c => ({
          name: c.name,
          category: c.category,
          is_core: c.is_core,
          enabled: c.enabled
        }))
      };
    }
  });

  // --------------------------------------------------------------------------
  // TOOL 4: switchboard_render_ui (Generatore Dashboard Interattiva HTML)
  // --------------------------------------------------------------------------
  ctx.tools.register({
    name: 'switchboard_render_ui',
    description: 'Compila e aggiorna la dashboard HTML interattiva del Quadro Elettrico (.dsh/tasks/switchboard.html).',
    parameters: {
      session_id: { type: 'string', required: false, description: 'Identificativo della sessione' }
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          html_path: { type: 'string' },
          session_id: { type: 'string' }
        }
      },
      render: (v) => JSON.stringify(v, null, 2)
    },
    execute: async (args) => {
      const data = await loadSwitchesData();
      const sessionId = args.session_id || 'default';
      const sessionConfig = resolveSessionConfig(data, sessionId);
      const components = await discoverAllCordisComponents(ctx, sessionConfig);

      const disabledCount = components.filter(c => !c.is_core && !c.enabled).length;
      const tokensSaved = disabledCount * 500;

      const html = renderSwitchboardHtml(components, sessionConfig.providers, sessionId, tokensSaved);

      await fs.mkdir(path.dirname(SWITCHBOARD_HTML), { recursive: true });
      await fs.writeFile(SWITCHBOARD_HTML, html, 'utf8');

      return {
        html_path: SWITCHBOARD_HTML,
        session_id: sessionId,
        message: 'Dashboard interattiva Switchboard generata con successo. Apribile dai deliverable.'
      };
    }
  });
}

export default {
  name,
  inject,
  apply,
  discoverAllCordisComponents,
  renderSwitchboardHtml
};

