/**
 * dsh-plugin-cordis-switchboard
 * Cordis Plugin for DeepSeek Harness (DSH)
 * Universal Toggle Switchboard for ALL Cordis plugins and tools.
 * Features:
 * - Single-session state isolation (per-session state in .dsh/switches.json)
 * - Dynamic hot-switching between consecutive conversation turns
 * - Search tool across plugins and tools by name, description, and category
 * - Core plugin protection (vital kernel components cannot be disabled)
 * - Deterministic dynamic tool pruning with token savings estimation
 * - Interactive HTML dashboard (.dsh/tasks/switchboard.html)
 */

import { promises as fs } from 'fs';
import path from 'path';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';
const SWITCHES_FILE = path.join(WORKSPACE_DIR, '.dsh', 'switches.json');
const SWITCHBOARD_HTML = path.join(WORKSPACE_DIR, '.dsh', 'tasks', 'switchboard.html');

// Essential Cordis / DSH kernel plugins (protected: cannot be disabled)
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
 * Loads configuration tree from disk
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
 * Saves configuration tree to disk
 */
async function saveSwitchesData(data) {
  try {
    await fs.mkdir(path.dirname(SWITCHES_FILE), { recursive: true });
    await fs.writeFile(SWITCHES_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[cordis-switchboard] Error saving switches.json: ${err.message}`);
  }
}

/**
 * Resolves effective configuration for a given session
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
 * Scans and returns catalog of ALL discovered Cordis plugins and tools
 */
async function discoverAllCordisComponents(ctx, sessionConfig) {
  const items = new Map();

  // 1. Introspect Cordis Loader entries (if available)
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
            description: `Cordis plugin mounted in runtime profile (${isCore ? 'Kernel Core' : 'Dynamic Extension'})`,
            is_core: isCore,
            token_weight: isCore ? 0 : 500,
            enabled: isCore ? true : !sessionConfig.disabled_plugins.has(name)
          });
        }
      }
    }
  } catch {}

  // 2. Introspect registered tools in ctx.tools
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
            description: tool.description || 'Operational tool registered in Cordis',
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
            description: (tool && tool.description) || 'Operational tool registered in Cordis',
            is_core: isCore,
            token_weight: 400,
            enabled: isCore ? true : !sessionConfig.disabled_tools.has(name)
          });
        }
      }
    }
  } catch {}

  // 3. Catalog of known community and built-in packages
  const knownCommunityCatalog = [
    { name: 'dsh-plugin-searxng', type: 'plugin', category: 'search', description: 'Private OSINT meta-search engine SearXNG', token_weight: 600 },
    { name: 'agent-reach', type: 'skill', category: 'community', description: 'Multi-channel OSINT for YouTube, Social Media, and Wayback Machine', token_weight: 700 },
    { name: 'dsh-plugin-the-architect', type: 'plugin', category: 'agentic', description: 'ICM Meta-Orchestrator, Fable Loop Triage, and Zero-Token Handoff', token_weight: 1200 },
    { name: 'dsh-plugin-plan-sidebar', type: 'plugin', category: 'agentic', description: 'Real-time interactive task progress visual dashboard', token_weight: 400 },
    { name: 'dsh-plugin-npm-guard', type: 'plugin', category: 'coding', description: 'Deterministic security guardrail for NPM supply-chain audits', token_weight: 350 },
    { name: 'docker_runner_exec', type: 'tool', category: 'coding', description: 'Ephemeral on-demand build and execution runners (Go, Rust, Python, Expo)', token_weight: 800 },
    { name: 'tool-web', type: 'tool', category: 'search', description: 'Standard DeepSeek Harness web search and navigation client', token_weight: 500 },
    { name: 'tool-subagent', type: 'tool', category: 'agentic', description: 'Zero-token isolated sub-agent spawning and orchestration', token_weight: 700 },
    { name: 'tool-goal', type: 'tool', category: 'agentic', description: 'Continuous progress driver for long-term goals and milestones', token_weight: 500 },
    { name: 'tool-ralph', type: 'tool', category: 'agentic', description: 'Multi-round sub-agent loop with budget up to 64 iterations', token_weight: 650 },
    { name: 'tool-todo', type: 'tool', category: 'agentic', description: 'Parallel task list and session todo tracker', token_weight: 350 }
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

  // 4. Add core protected components if not already mapped
  for (const coreName of CORE_PROTECTED_PLUGINS) {
    if (!items.has(coreName)) {
      items.set(coreName, {
        name: coreName,
        type: 'core',
        category: 'core',
        description: 'Essential Cordis / DSH microkernel component (Protected)',
        is_core: true,
        token_weight: 0,
        enabled: true
      });
    }
  }

  return Array.from(items.values());
}

/**
 * Renders standalone HTML Dashboard with live search, filters, and toggles
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
          Session: <strong class="text-white">${sessionId}</strong>
        </span>
        <span id="token-badge" class="text-xs px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono">
          -${tokensSaved} Token Pruned
        </span>
      </div>
    </div>

    <!-- Web Search Provider Section -->
    <div class="mb-5 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
      <div class="flex items-center justify-between mb-2.5">
        <div class="flex items-center space-x-2">
          <span class="text-sm">🌐</span>
          <h2 class="text-xs font-semibold text-slate-200">Web Search Provider Switchboard</h2>
        </div>
        <span class="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Per-Turn Dynamic Selection</span>
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs">
        <button onclick="setWebProvider('searxng')" id="btn-prov-searxng"
          class="py-2 px-3 rounded-lg font-medium border text-center transition-all ${providers.web_search === 'searxng' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}">
          🔍 SearXNG (Private OSINT)
        </button>
        <button onclick="setWebProvider('default')" id="btn-prov-default"
          class="py-2 px-3 rounded-lg font-medium border text-center transition-all ${providers.web_search === 'default' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}">
          🌍 Classic Search (Default)
        </button>
        <button onclick="setWebProvider('disabled')" id="btn-prov-disabled"
          class="py-2 px-3 rounded-lg font-medium border text-center transition-all ${providers.web_search === 'disabled' ? 'bg-rose-900 border-rose-700 text-rose-100 shadow-lg shadow-rose-900/30' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}">
          🚫 Disabled (Offline)
        </button>
      </div>
      <p class="text-[11px] text-slate-400 mt-2 italic">
        💡 Practical tip: If SearXNG returns suboptimal results, switch to <strong>Classic Search</strong> for subsequent queries without restarting DSH.
      </p>
    </div>

    <!-- Search Bar and Category Filters -->
    <div class="space-y-2.5 mb-4">
      <div class="relative">
        <input type="text" id="search-input" placeholder="🔍 Search plugins, tools, or capabilities (e.g., searx, reach, code, bash)..."
          oninput="applyFilters()"
          class="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors">
      </div>

      <!-- Quick filters -->
      <div class="flex flex-wrap gap-1.5 text-[11px]">
        <button onclick="setCategoryFilter('all')" class="cat-pill px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium" data-cat="all">All</button>
        <button onclick="setCategoryFilter('search')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="search">Search & OSINT</button>
        <button onclick="setCategoryFilter('community')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="community">Community / Skills</button>
        <button onclick="setCategoryFilter('agentic')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="agentic">Agentic & Planning</button>
        <button onclick="setCategoryFilter('coding')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="coding">Software Factory</button>
        <button onclick="setCategoryFilter('core')" class="cat-pill px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-white font-medium" data-cat="core">Core (Protected)</button>
      </div>
    </div>

    <!-- Introspected Components List -->
    <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
      <div class="px-3.5 py-2 bg-slate-800/40 border-b border-slate-800 text-[11px] font-semibold text-slate-400 flex justify-between">
        <span id="count-label">Detected components: ${items.length}</span>
        <span>Status for: ${sessionId}</span>
      </div>
      <div id="items-container" class="divide-y divide-slate-800/60 max-h-80 overflow-y-auto p-1">
        <!-- Dynamic render via JavaScript -->
      </div>
    </div>

    <!-- Information Footer -->
    <div class="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
      <div class="flex items-center space-x-2">
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Changes persisted in <code>.dsh/switches.json</code></span>
      </div>
      <div class="text-[10px] font-mono text-slate-400">
        Command: <code>/switchboard toggle &lt;name&gt;</code>
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

      document.getElementById('count-label').textContent = 'Showing: ' + filtered.length + ' of ' + catalog.length;

      if (filtered.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-xs text-slate-500">No plugins or tools match your search.</div>';
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
                  \${isCore ? 'CORE (PROTECTED)' : (item.enabled ? 'ACTIVE' : 'DISABLED')}
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
  // TOOL 1: switchboard_search (Universal Plugin and Tool Discovery)
  // --------------------------------------------------------------------------
  ctx.tools.register({
    name: 'switchboard_search',
    description: 'Searches across ALL available Cordis plugins and tools (community, OSINT, search, agentic, core) by name, description, or category.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search term (e.g. "searx", "reach", "osint", "bash", "architect")' },
      category: { type: 'string', required: false, description: 'Optional category filter: "all", "search", "community", "agentic", "coding", "core"' },
      session_id: { type: 'string', required: false, description: 'Session identifier (default: "default")' }
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
  // TOOL 2: switchboard_toggle (Per-session Activation/Deactivation)
  // --------------------------------------------------------------------------
  ctx.tools.register({
    name: 'switchboard_toggle',
    description: 'Enables or disables a plugin or tool for the current session (or globally), or toggles the web search provider (searxng vs default).',
    parameters: {
      target_name: { type: 'string', required: true, description: 'Exact name of plugin/tool/provider (e.g. "dsh-plugin-searxng", "agent-reach", "docker_runner_exec", "web_search")' },
      enabled: { type: 'boolean', required: false, description: 'true to enable, false to disable (if omitted, inverts current state)' },
      provider_value: { type: 'string', required: false, description: 'For target="web_search": "searxng", "default", or "disabled"' },
      scope: { type: 'string', required: false, description: '"session" (default, for current session) or "global"' },
      session_id: { type: 'string', required: false, description: 'Session identifier (default: "default")' }
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
          message: `Rejected: '${target}' is a CORE Cordis / DSH component and cannot be disabled.`
        };
      }

      const data = await loadSwitchesData();

      // 2. Web Search Provider Switcher Handling (SearXNG vs Default)
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
          message: `Web search provider switched to '${val}' for ${scope === 'session' ? `session ${sessionId}` : 'all sessions'}.`
        };
      }

      // 3. Generic Plugin / Tool Toggle Handling
      const targetConfig = scope === 'session' ?
        (data.sessions[sessionId] = data.sessions[sessionId] || { disabled_plugins: [], disabled_tools: [], providers: {} }) :
        data.global;

      targetConfig.disabled_plugins = targetConfig.disabled_plugins || [];
      targetConfig.disabled_tools = targetConfig.disabled_tools || [];

      // Determine target state
      const isCurrentlyDisabled = targetConfig.disabled_plugins.includes(target) || targetConfig.disabled_tools.includes(target);
      const shouldEnable = args.enabled !== undefined ? args.enabled : isCurrentlyDisabled;

      if (shouldEnable) {
        // Enable by removing from exclusion lists
        targetConfig.disabled_plugins = targetConfig.disabled_plugins.filter(p => p !== target);
        targetConfig.disabled_tools = targetConfig.disabled_tools.filter(t => t !== target);
      } else {
        // Disable by adding to exclusion list
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
        message: `Component '${target}' successfully ${shouldEnable ? 'ENABLED' : 'DISABLED'} for ${scope === 'session' ? `session ${sessionId}` : 'all sessions'}. Dynamic Tool Pruning active.`
      };
    }
  });

  // --------------------------------------------------------------------------
  // TOOL 3: switchboard_status (Stato riepilogativo universale)
  // --------------------------------------------------------------------------
  ctx.tools.register({
    name: 'switchboard_status',
    description: 'Displays complete status of all toggles, active providers, and estimated tokens saved for current session.',
    parameters: {
      session_id: { type: 'string', required: false, description: 'Session identifier (default: "default")' }
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
    description: 'Renders and updates the interactive HTML switchboard dashboard (.dsh/tasks/switchboard.html).',
    parameters: {
      session_id: { type: 'string', required: false, description: 'Session identifier' }
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
        message: 'Interactive Switchboard dashboard generated successfully. Available in deliverables.'
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

