# dsh-plugin-cordis-switchboard 🎛️

[![npm version](https://img.shields.io/npm/v/dsh-plugin-cordis-switchboard.svg)](https://www.npmjs.com/package/dsh-plugin-cordis-switchboard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![DSH Plugin Hub](https://img.shields.io/badge/DSH--Plugin-Control--Panel-purple.svg)](https://dsh-plugin.org)

Universal Cordis Plugin & Tool Toggle Switchboard for **DeepSeek Harness (DSH)**.

Provides hot-switching of tool providers (e.g. SearXNG OSINT vs Default Web Search), per-session dynamic tool pruning, real-time discovery of all Cordis plugins, and seamless integration inside the Plan Sidebar workbench.

---

## 🌟 Key Features

* **Universal Cordis Introspection:** Scans `ctx.loader` and `ctx.tools` at runtime to dynamically discover all plugins and tools in the ecosystem, including community tools, MCP servers, and system plugins.
* **Per-Session & Turn-by-Turn Switching:** Enables switching capabilities between consecutive conversation turns (e.g., Turn 1 with in-depth SearXNG OSINT, Turn 2 with standard web search or aggressive tool pruning), persisting state to `.dsh/switches.json`.
* **Kernel Core Protection (`CORE_PROTECTED_PLUGINS`):** Safeguards critical infrastructure components (`tool-bash`, `tool-fs`, `tool-str-replace-editor`, `connection`) against accidental deactivation.
* **Dynamic Tool Pruning & Token Savings:** Prunes deactivated tool definitions from LLM request payloads, saving hundreds of context tokens per turn.
* **Native Sidebar Integration:** When paired with `dsh-plugin-plan-sidebar`, mounts automatically as a dedicated tab inside the right-dock workbench with live search and reactive switches.

---

## 📦 Installation in DeepSeek Harness

Run from your DSH environment:

```bash
dsh plugin --profile web add dsh-plugin-cordis-switchboard
```

DSH automatically discovers the `dsh.bundle.patch` declaration in `package.json`, registers the bundle in `dsh.profile.bundles`, and mounts the runtime.

Or configure manually in `cordis.patch.yml`:

```yaml
- insert:
    - id: cordis-switchboard
      name: 'dsh-plugin-cordis-switchboard'
```

---

## 🛠️ Exposed Tools for LLMs & Agents

1. `switchboard_status`: Returns global status of all plugins, active providers, and estimated token savings for the session.
2. `switchboard_toggle`: Instantly switches a plugin, tool, or provider route (e.g., `web_search: 'searxng'` <-> `'default'`).
3. `switchboard_search`: Searches across all tools and plugins by name, category, or description.
4. `switchboard_render_ui`: Renders an interactive standalone HTML dashboard (`.dsh/tasks/switchboard.html`).

---

## 🚀 Publishing to dsh-plugin.org & npm

1. **Tag and Release on GitHub:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. **Publish to npm:**
   ```bash
   npm publish --access public
   ```
3. **Registry Discovery:**
   `https://dsh-plugin.org` automatically indexes packages carrying the `dsh-plugin` keyword and the `dsh.bundle` manifest.

---

## 📄 License

MIT © Bebbolus
