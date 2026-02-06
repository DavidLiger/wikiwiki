# WIKIWIKI  - Démarrage Rapide

## Installation

```bash
cd wikiwiki  
npm install
```

## Lancer en dev

```bash
npm run dev
```

Ouvre http://localhost:3000 dans ton navigateur.

## Premier Test

1. Tape "Sidney Bechet" dans la barre de recherche
2. Appuie sur Entrée
3. Observe :
   - L'entité résolue (Wikidata ID, description)
   - Les sources disponibles (Wikipedia, MusicBrainz si musicien)
   - Le graphe construit (nodes + edges)
4. Regarde aussi la console du navigateur pour les logs détaillés

## Ce qui est implémenté

✅ **Entity Resolver** (`src/lib/entityResolver.js`)
- Résolution titre → Wikidata ID
- Enrichissement multi-sources (Wikipedia, MusicBrainz)
- Extraction identifiants externes

✅ **Graph Builder** (`src/lib/graphBuilder.js`)
- Construction graphe depuis entité centrale
- Extraction liens Wikipedia + relations Wikidata
- Limitation profondeur/nodes pour performance

✅ **Interface de test** (`src/App.svelte`)
- Barre de recherche
- Affichage entité résolue
- Aperçu graphe construit

## Prochaines Étapes

### À faire toi-même :

1. **Visualisation D3.js**
   - Installer D3 : `npm install d3`
   - Créer composant Graph.svelte
   - Force simulation + rendu SVG

2. **IndexedDB**
   - Dexie déjà dans les deps
   - Créer `src/lib/db.js`
   - Tables : entities, paths, collections

3. **Navigation**
   - Clic sur nœud → devient nouveau centre
   - Breadcrumb
   - Historique

## Structure des Données

### Entity
```javascript
{
  id: "Q105858",           // Wikidata ID
  name: "Sidney Bechet",
  description: "...",
  type: "person",
  identifiers: {
    musicbrainz: "...",
    viaf: "...",
    // ...
  },
  sources: {
    wikipedia: { title, extract, links, ... },
    wikidata: { claims, sitelinks },
    musicbrainz: { recordings, releases, ... }
  }
}
```

### Graph
```javascript
{
  nodes: [
    { id, label, type, level, isCenter },
    // ...
  ],
  edges: [
    { from, to, type, source },
    // ...
  ]
}
```

## APIs

- Wikipedia : pas de limite, pas de clé
- Wikidata : pas de limite, pas de clé
- MusicBrainz : 1 req/sec, User-Agent requis

## Notes

- Le code est commenté
- Types JSDoc pour autocomplete
- Console logs pour debug
- Rate limits respectés

Bon code ! 🚀
