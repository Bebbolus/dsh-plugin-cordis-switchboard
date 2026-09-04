# dsh-plugin-cordis-switchboard

Universal Cordis Plugin & Tool Toggle Switchboard for **DeepSeek Harness (DSH)**.

Provides hot-switching of tool providers (e.g. SearXNG OSINT vs Default Web Search), per-session dynamic tool pruning, real-time discovery of all Cordis plugins, and seamless integration inside the Plan Sidebar workbench.

---

## 🎛️ Caratteristiche Principali

* **Introspezione Cordis Universale:** Scansiona a runtime `ctx.loader` e `ctx.tools` scoprendo dinamicamente tutti i plugin e gli strumenti caricati nell'ecosistema, inclusi tool community, server MCP e plugin nativi.
* **Commutazione Turn-by-Turn Per-Session:** Permette all'utente o all'agente di variare la composizione degli strumenti tra turni di conversazione consecutivi (es. Turno 1 con ricerca OSINT approfondita via SearXNG, Turno 2 con ricerca web standard o tool pruning restrittivo), salvando lo stato in `.dsh/switches.json`.
* **Protezione Kernel Core (`CORE_PROTECTED_PLUGINS`):** Protegge i componenti infrastrutturali critici (`tool-bash`, `tool-fs`, `tool-str-replace-editor`, `connection`) evitando disattivazioni accidentali.
* **Integrazione Nativia nella Sidebar:** Quando installato insieme a `dsh-plugin-plan-sidebar`, si monta automaticamente come tab dedicato nel dock laterale con barra di ricerca in tempo reale e switch animati.

---

## 📦 Installazione in DeepSeek Harness

Esegui dal terminale di DSH:

```bash
dsh plugin --profile web add dsh-plugin-cordis-switchboard
```

DSH riconosce automaticamente la dichiarazione `dsh.bundle.patch` in `package.json`, inserisce il bundle in `dsh.profile.bundles` del profilo web e applica il patch layer.

Oppure tramite configurazione manuale in `cordis.patch.yml`:
```yaml
- insert:
    - id: cordis-switchboard
      name: 'dsh-plugin-cordis-switchboard'
```

---

## 🛠️ Tool Esposti per LLM & Agenti

1. `switchboard_status`: Restituisce lo stato globale di tutti i plugin e toggle attivi per la sessione.
2. `switchboard_toggle`: Commuta istantaneamente un plugin o un provider (es. `searchProvider: 'searxng'` <-> `'default'`).
3. `switchboard_search`: Cerca fra tutti i tool e plugin per nome, categoria o descrizione.

---

## 🌐 Pubblicazione su dsh-plugin.org & npm

1. **Tag e Release su GitHub:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. **Pubblicazione npm:**
   ```bash
   npm publish --access public
   ```
3. **Indicizzazione:**
   Il marketplace `https://dsh-plugin.org` rileva automaticamente i pacchetti npm aventi la keyword `dsh-plugin` e il manifest `dsh.bundle`.

---

## Licenza
MIT © Bebbolus
