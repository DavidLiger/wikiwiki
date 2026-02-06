/**
 * GRAPH BUILDER
 * 
 * Construit un graphe de relations à partir d'une entité centrale
 * Extrait les liens Wikipedia + relations Wikidata
 * Limite la profondeur pour performance
 */

const SCORES = {
  STRUCTURAL: 3,  // Relations directes Wikidata (Œuvre, Genre, Parent)
  CONTEXTUAL: 2,  // Liens dans l'intro Wikipedia ou catégories fortes
  ASSOCIATIVE: 1  // Liens généraux dans le corps de l'article
};

const IMPORTANT_PROPERTIES = {
  'P31': 'type',              // Instance de
  'P106': 'occupation',       // Profession
  'P800': 'notable_work',     // Œuvre notable
  'P136': 'genre',            // Genre musical/littéraire
  'P101': 'field_of_work',    // Domaine de travail
  'P737': 'influenced_by',    // Influencé par
  'P175': 'performer',        // Interprète
  'P161': 'cast_member',      // Acteur
  'P57': 'director',          // Réalisateur
  'P279': 'subclass_of',      // Sous-classe de
};

import { resolveEntity } from './entityResolver.js';

/**
 * Construit un graphe de connaissances depuis une entité centrale
 * @param {Entity} centerEntity - Entité centrale du graphe
 * @param {number} depth - Profondeur du graphe (1 ou 2 max recommandé)
 * @param {number} maxNodesPerLevel - Limite de nœuds par niveau (défaut 20)
 * @returns {Promise<Graph>} Graphe {nodes, edges}
 */
export async function buildGraph(centerEntity, depth = 1, maxNodesPerLevel = 20) {
  const graph = {
    nodes: [],
    edges: []
  };

  // Map pour éviter les doublons
  const visited = new Set();
  const nodeMap = new Map();

  // Ajouter le nœud central
  const centerNode = createNode(centerEntity, 0, true);
  graph.nodes.push(centerNode);
  nodeMap.set(centerEntity.id, centerNode);
  visited.add(centerEntity.id);

  // Queue pour BFS (Breadth-First Search)
  const queue = [{ entity: centerEntity, level: 0 }];

  while (queue.length > 0) {
    const { entity, level } = queue.shift();
    if (level >= depth) continue;

    const connectedEntities = extractConnectedEntities(entity);
    const limitedEntities = connectedEntities.filter(e => e.score >= 2).slice(0, maxNodesPerLevel);

    for (const connected of limitedEntities) {
      const { id, label, type, source, score } = connected; // 'source' ici est "wikidata" ou "wikipedia"

      if (visited.has(id)) {
        // ON CHANGE : on passe 'source' sous le nom 'origin'
        addEdge(graph, entity.id, id, type, source, score); 
        continue;
      }

      visited.add(id);
      const node = { id, label, type, level: level + 1, score };
      graph.nodes.push(node);
      nodeMap.set(id, node);

      // ON CHANGE : on passe 'source' sous le nom 'origin'
      addEdge(graph, entity.id, id, type, source, score);
    }
  }
    // --- NOUVEAU : Traduction des QIDs ---
  const qidsToTranslate = graph.nodes
    .filter(node => node.id.startsWith('Q'))
    .map(node => node.id);

  if (qidsToTranslate.length > 0) {
    const labelsMap = await fetchWikidataLabels(qidsToTranslate);
    graph.nodes.forEach(node => {
      if (labelsMap[node.id]) {
        node.label = labelsMap[node.id];
      }
    });
  }

  console.log(`Graph built: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  return graph;
}

/**
 * Crée un objet node pour le graphe
 */
function createNode(entity, level, isCenter = false) {
  return {
    id: entity.id,
    label: entity.name,
    type: entity.type,
    level,
    isCenter,
    description: entity.description,
    thumbnail: entity.sources.wikipedia?.thumbnail
  };
}

/**
 * Ajoute un edge au graphe
 */
function addEdge(graph, fromId, toId, type, origin, score) {
  graph.edges.push({
    source: fromId, // D3 attend 'source' pour l'ID de départ
    target: toId,   // D3 attend 'target' pour l'ID d'arrivée
    type: type,
    origin: origin, // On renomme la source de donnée en 'origin' pour éviter le conflit
    value: score
  });
}

function extractConnectedEntities(entity) {
  const connectedMap = new Map(); // Utilise une Map pour éviter les doublons et gérer les scores

  // --- 1. EXTRACTION WIKIDATA (Score 3 - Haute pertinence) ---
  if (entity.sources.wikidata?.claims) {
    const claims = entity.sources.wikidata.claims;
    
    for (const [prop, relationType] of Object.entries(IMPORTANT_PROPERTIES)) {
      if (claims[prop]) {
        claims[prop].forEach(claim => {
          const value = claim.mainsnak.datavalue?.value;
          if (value && value.id) {
            connectedMap.set(value.id, {
              id: value.id,
              label: value.id, // On résoudra le label plus tard ou on utilisera le titre wiki
              type: relationType,
              score: SCORES.STRUCTURAL,
              source: 'wikidata'
            });
          }
        });
      }
    }
  }

  // --- 2. EXTRACTION WIKIPEDIA (Score 1 ou 2) ---
  if (entity.sources.wikipedia?.links) {
    const links = entity.sources.wikipedia.links;
    
    links.forEach((linkTitle, index) => {
      // Filtrer les bruits (années, dates, méta)
      if (isLinkNoise(linkTitle)) return;

      const id = `wiki:${linkTitle}`;
      
      // Si le lien existe déjà via Wikidata, on ne change pas son score (déjà à 3)
      if (connectedMap.has(id)) return;

      // On donne un score de 2 aux 10 premiers liens (souvent dans l'introduction)
      // Et un score de 1 aux suivants (corps de texte)
      const score = (index < 10) ? SCORES.CONTEXTUAL : SCORES.ASSOCIATIVE;

      connectedMap.set(id, {
        id: id,
        label: linkTitle,
        type: 'related',
        score: score,
        source: 'wikipedia'
      });
    });
  }

  // Convertir la Map en tableau et trier par score décroissant
  return Array.from(connectedMap.values())
    .sort((a, b) => b.score - a.score);
}

/**
 * Filtre pour éliminer les liens Wikipedia non pertinents (dates, siècles, etc.)
 */
function isLinkNoise(title) {
  // Années (ex: "1959", "19e siècle")
  if (/^\d+$/.test(title)) return true;
  if (title.includes('siècle')) return true;
  
  // Pages techniques
  const technical = [
    'Aide:', 'Modèle:', 'Wikipédia:', 'Portail:', 'Catégorie:', 
    'Fichier:', 'Projet:', 'Discussion:', 'Spécial:', 'Liste de'
  ];
  if (technical.some(p => title.startsWith(p))) return true;

  // Mois de l'année
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  if (months.some(m => title.toLowerCase().includes(m))) return true;

  return false;
}

/**
 * Fonction helper pour résoudre plusieurs entités en parallèle
 * (à utiliser si on veut enrichir les nœuds connectés)
 */
export async function resolveConnectedEntities(entityIds, maxConcurrent = 5) {
  const results = [];
  
  // Traiter par batch pour éviter de surcharger les APIs
  for (let i = 0; i < entityIds.length; i += maxConcurrent) {
    const batch = entityIds.slice(i, i + maxConcurrent);
    
    const batchResults = await Promise.allSettled(
      batch.map(id => resolveEntity(id))
    );

    results.push(
      ...batchResults
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
    );

    // Pause entre batch pour respecter rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Récupère les noms (labels) pour une liste d'IDs Wikidata
 */
async function fetchWikidataLabels(ids) {
  if (ids.length === 0) return {};
  
  const lang = 'fr'; // Ou récupère CURRENT_LANG
  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'labels',
    languages: lang,
    format: 'json',
    origin: '*'
  });

  try {
    const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`);
    const data = await response.json();
    const labels = {};
    
    if (data.entities) {
      for (const id of ids) {
        labels[id] = data.entities[id]?.labels?.[lang]?.value || id;
      }
    }
    return labels;
  } catch (e) {
    console.error("Erreur lors de la récupération des labels:", e);
    return {};
  }
}

/**
 * Type Graph
 * @typedef {Object} Graph
 * @property {Array<Node>} nodes - Liste des nœuds
 * @property {Array<Edge>} edges - Liste des liens
 */

/**
 * Type Node
 * @typedef {Object} Node
 * @property {string} id - ID unique (Wikidata ID ou wiki:title)
 * @property {string} label - Label à afficher
 * @property {string} type - Type de nœud (person, article, etc.)
 * @property {number} level - Niveau dans le graphe (0 = centre)
 * @property {boolean} isCenter - Est le nœud central
 */

/**
 * Type Edge
 * @typedef {Object} Edge
 * @property {string} from - ID du nœud source
 * @property {string} to - ID du nœud cible
 * @property {string} type - Type de relation
 * @property {string} source - Source (wikipedia, wikidata, etc.)
 */
