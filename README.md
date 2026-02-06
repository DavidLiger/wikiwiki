# WIKIWIKI  

Réseau de connaissances décentralisé. Navigation dans un graphe d'informations vérifiées (Wikipedia, Wikidata).

## Setup

```bash
npm install
npm run dev
```

Ouvre http://localhost:3000

## Architecture Core Implémentée

### Entity Resolver (`src/lib/entityResolver.js`)

Fonction centrale qui résout une entité :
1. Prend un titre Wikipedia
2. Récupère l'ID Wikidata
3. Extrait les identifiants externes (MusicBrainz, TMDB, etc.)
4. Fetch parallèle sur toutes les APIs disponibles
5. Retourne une entité enrichie avec toutes les sources

**Usage :**
```javascript
import { resolveEntity } from './lib/entityResolver.js';

const entity = await resolveEntity('Sidney Bechet');
// Retourne : { id, name, description, type, identifiers, sources }
```

### Graph Builder (`src/lib/graphBuilder.js`)

Construit un graphe de relations :
1. Prend une entité centrale
2. Extrait liens Wikipedia + relations Wikidata
3. Crée nodes + edges
4. Limite profondeur (1-2 niveaux max)

**Usage :**
```javascript
import { buildGraph } from './lib/graphBuilder.js';

const graph = await buildGraph(entity, 1); // depth = 1
// Retourne : { nodes: [...], edges: [...] }
```

## Test Rapide

1. Lance `npm run dev`
2. Tape "Sidney Bechet" ou "Jazz" dans la barre de recherche
3. Appuie sur Entrée
4. Observe les logs console + l'affichage des données

## Structure

```
wikiwiki/
├── src/
│   ├── lib/
│   │   ├── entityResolver.js  ← Résolution entités
│   │   └── graphBuilder.js    ← Construction graphe
│   ├── App.svelte             ← Interface de test
│   ├── main.js                ← Point d'entrée
│   └── app.css                ← Styles globaux
├── public/
├── index.html
├── vite.config.js
└── package.json
```

## Prochaines Étapes

### Visualisation
- [ ] Intégrer D3.js force simulation
- [ ] Rendu SVG du graphe
- [ ] Navigation par clic sur nœuds
- [ ] Zoom/Pan

### Stockage
- [ ] IndexedDB avec Dexie
- [ ] Cache des entités
- [ ] Historique navigation
- [ ] Collections

### Social P2P
- [ ] WebRTC setup
- [ ] Messagerie directe
- [ ] Partage d'articles

## APIs Utilisées

- **Wikipedia REST API** : résumés, liens
- **Wikidata** : entités structurées, relations
- **MusicBrainz** : données musicales (rate limit 1 req/s)

## Notes Techniques

- Rate limits : cache agressif recommandé
- MusicBrainz : wait 1s entre requêtes
- Graph depth : limiter à 1-2 pour perf
- Nodes par niveau : max 20 recommandé

## Dev

Le fichier `App.svelte` est une interface de test qui affiche :
- Entité résolue avec toutes ses données
- Sources disponibles
- Graphe construit (nodes + edges)

C'est un playground pour tester le core avant de faire la vraie UI.
