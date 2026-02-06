/**
 * GRAPH BUILDER
 * 
 * Construit un graphe de relations à partir d'une entité centrale
 * Extrait les liens Wikipedia + relations Wikidata
 * Limite la profondeur pour performance
 */

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

    // Extraire les nœuds connexes
    const connectedIds = extractConnectedEntities(entity);
    
    // Limiter le nombre de connexions pour perf
    const limitedIds = connectedIds.slice(0, maxNodesPerLevel);

    // Traiter chaque connexion
    for (const { id, label, type, source } of limitedIds) {
      if (visited.has(id)) {
        // Nœud déjà visité, juste ajouter l'edge
        addEdge(graph, entity.id, id, type, source);
        continue;
      }

      visited.add(id);

      // Créer le nœud (sans résolution complète pour perf)
      const node = {
        id,
        label,
        type,
        level: level + 1,
        isCenter: false
      };

      graph.nodes.push(node);
      nodeMap.set(id, node);

      // Ajouter l'edge
      addEdge(graph, entity.id, id, type, source);

      // Si on veut continuer plus profond, on peut résoudre l'entité
      // Pour l'instant, on s'arrête là (perf)
      if (level + 1 < depth) {
        // Optionnel : résoudre l'entité pour aller plus profond
        // queue.push({ entity: await resolveEntity(label), level: level + 1 });
      }
    }
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
function addEdge(graph, fromId, toId, type, source) {
  graph.edges.push({
    from: fromId,
    to: toId,
    type,
    source
  });
}

/**
 * Extrait les IDs des entités connectées depuis différentes sources
 */
function extractConnectedEntities(entity) {
  const connected = [];

  // 1. Liens Wikipedia (titres d'articles) - AVEC FILTRE
  if (entity.sources.wikipedia?.links) {
    const links = entity.sources.wikipedia.links
      .filter(linkTitle => {
        // Exclure les pages techniques/méta
        const excludePatterns = [
          'Aide:',
          'Modèle:',
          'Wikipédia:',
          'Portail:',
          'Catégorie:',
          'Fichier:',
          'Projet:',
          'Discussion:',
          'Spécial:'
        ];
        
        return !excludePatterns.some(pattern => linkTitle.startsWith(pattern));
      })
      .slice(0, 30); // Limiter à 30 liens pertinents
    
    for (const linkTitle of links) {
      connected.push({
        id: `wiki:${linkTitle}`,
        label: linkTitle,
        type: 'article',
        source: 'wikipedia'
      });
    }
  }

  // 2. Relations Wikidata (propriétés structurées)
  if (entity.sources.wikidata?.claims) {
    const claims = entity.sources.wikidata.claims;
    
    // Relations importantes à extraire
    const importantProperties = {
      'P40': 'child',              // Enfant
      'P26': 'spouse',             // Conjoint
      'P22': 'father',             // Père
      'P25': 'mother',             // Mère
      'P3373': 'sibling',          // Frère/sœur
      'P800': 'notable_work',      // Œuvre notable
      'P136': 'genre',             // Genre
      'P106': 'occupation',        // Profession
      'P101': 'field_of_work',     // Domaine de travail
      'P737': 'influenced_by',     // Influencé par
      'P279': 'subclass_of',       // Sous-classe de
      'P361': 'part_of',           // Partie de
      'P527': 'has_part',          // A pour partie
    };

    for (const [property, relationType] of Object.entries(importantProperties)) {
      if (claims[property]) {
        for (const claim of claims[property]) {
          const value = claim.mainsnak.datavalue?.value;
          
          if (value && value.id) {
            // C'est une référence à une autre entité Wikidata
            connected.push({
              id: value.id,
              label: value.id, // On n'a pas le label ici, juste l'ID
              type: relationType,
              source: 'wikidata'
            });
          }
        }
      }
    }
  }

  return connected;
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
