# dsh-plugin-cordis-switchboard

Universal Cordis Plugin & Tool Toggle Switchboard for **DeepSeek Harness (DSH)**.

## Caratteristiche

* **Introspezione Universale:** Scansiona `ctx.registry` e `ctx.tools` scoprendo *automaticamente* qualsiasi plugin o tool installato nel runtime Cordis (senza hardcoding).
* **Dynamic Tool Pruning:** Disattiva lo schema JSON dei tool non necessari durante la chiamata all'LLM, risparmiando 400-800 token per turno ed eliminando allucinazioni.
* **Commutazione Provider a Caldo:** Permette di commutare i provider di sistema (es. Search Provider tra SearXNG privato locale e DuckDuckGo/Jina pubblico, o disabilitazione completa).
* **Persistenza di Stato:** Salva la configurazione scelta in `.dsh/switches.json`.
* **Interfaccia Grafica:** Genera un cruscotto HTML interattivo (`switchboard.html`) con indicatori dei token potati.

## Tool Esposti

1. `switchboard_list_all`: Elenca tutti i tool e provider con stato e peso in token.
2. `switchboard_toggle`: Abilita/disabilita un tool o commuta un provider.
3. `switchboard_render_ui`: Rigenera la pagina HTML del quadro elettrico.

## Installazione in DSH

In `cordis.patch.yml`:
```yaml
- insert:
    - id: cordis-switchboard
      name: 'dsh-plugin-cordis-switchboard'
```

## Licenza
MIT
