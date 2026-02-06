/**
 * ENTITY RESOLVER
 * 
 * Fonction centrale qui résout une entité depuis son titre Wikipedia
 * et l'enrichit avec données de multiples sources (Wikidata, MusicBrainz, TMDB, etc.)
 */

/**
 * Détecte la langue du navigateur (format ISO 2 lettres: fr, en, es, etc.)
 */
function getBrowserLanguage() {
  const lang = navigator.language || navigator.userLanguage || 'en';
  return lang.split('-')[0];
}

// Langue détectée (peut être changée manuellement)
let CURRENT_LANG = getBrowserLanguage();

console.log('🌍 Langue détectée:', CURRENT_LANG);

/**
 * Construit les URLs API selon la langue courante
 */
function getWikipediaAPI() {
  return `https://${CURRENT_LANG}.wikipedia.org/w/api.php`;
}

function getWikipediaRestAPI() {
  return `https://${CURRENT_LANG}.wikipedia.org/api/rest_v1`;
}

// Constantes
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_ENTITY_API = 'https://www.wikidata.org/wiki/Special:EntityData';
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const TMDB_API_KEY = null; // À configurer si besoin : obtenir sur themoviedb.org

/**
 * Point d'entrée principal avec recherche améliorée
 * Retourne soit une entité, soit une liste de candidats pour désambiguïsation
 */
export async function resolveEntity(searchTerm) {
  try {
    const searchResults = await searchWikipedia(searchTerm);
    
    if (searchResults.length === 0) {
      throw new Error(`Aucun résultat trouvé pour "${searchTerm}"`);
    }

    const candidates = [];
    
    for (const title of searchResults) {
      const result = await getWikidataIdFromWikipedia(title);
      
      // On vérifie si on a un ID et si on ne l'a pas déjà ajouté
      if (result && result.id) {
        const alreadyExists = candidates.find(c => c.wikidataId === result.id);
        if (!alreadyExists) {
          candidates.push({ 
            title: result.realTitle, 
            wikidataId: result.id 
          });
        }
      }
    }
    
    if (candidates.length === 0) {
      throw new Error(`Aucun article valide trouvé pour "${searchTerm}"`);
    }

    // Si on a un résultat exact ou si le premier candidat correspond 
    // exactement à ce qu'on cherche (après redirection)
    if (candidates.length === 1) {
      return await resolveEntityFromCandidate(candidates[0].title, candidates[0].wikidataId);
    }

    // Sinon, on propose la liste de désambiguïsation
    return {
      needsDisambiguation: true,
      candidates: candidates
    };

  } catch (error) {
    console.error('Entity resolution error:', error);
    throw error;
  }
}

/**
 * Résout une entité depuis un titre et ID Wikidata connus
 * (utilisé après désambiguïsation ou pour résolution directe)
 */
export async function resolveEntityFromCandidate(title, wikidataId) {
  try {
    console.log(`Recherche "${title}" → Résolution ${wikidataId}`);
    
    const wikidataEntity = await fetchWikidataEntity(wikidataId);

    const entity = {
      id: wikidataId,
      name: getLabel(wikidataEntity, CURRENT_LANG) || title,
      description: getDescription(wikidataEntity, CURRENT_LANG),
      type: inferEntityType(wikidataEntity),
      identifiers: extractExternalIdentifiers(wikidataEntity),
      sources: {
        wikidata: {
          claims: wikidataEntity.claims || {},
          sitelinks: wikidataEntity.sitelinks || {}
        }
      }
    };

    // Enrichir en parallèle depuis toutes les sources
    await Promise.allSettled([
      enrichFromWikipedia(entity, title),
      enrichFromWikipediaExternalLinks(entity, title), 
      enrichFromMusicBrainz(entity),
      enrichFromTMDB(entity),
      enrichFromOpenLibrary(entity),
      enrichFromWikimediaCommons(entity),
      enrichFromOpenStreetMap(entity),
      enrichFromArxiv(entity),
      enrichFromArchiveOrg(entity)
    ]);

    return entity;

  } catch (error) {
    console.error('Entity resolution error:', error);
    throw error;
  }
}

/**
 * Recherche Wikipedia et retourne plusieurs résultats
 */
async function searchWikipedia(query) {
  const params = new URLSearchParams({
    action: 'opensearch',
    search: query,
    limit: 10,
    format: 'json',
    origin: '*'
  });

  const url = `${getWikipediaAPI()}?${params}`;
  const response = await fetch(url);
  const data = await response.json();
  
  // opensearch retourne un tableau : [requête, [titres], [descriptions], [liens]]
  // Les titres sont dans le deuxième élément du tableau : data[1]
  if (Array.isArray(data) && data[1]) {
    return data[1];
  }
  
  return [];
}

async function getWikidataIdFromWikipedia(title) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    titles: title,
    redirects: 1, // <-- TRÈS IMPORTANT : suit la redirection
    format: 'json',
    origin: '*'
  });

  const response = await fetch(`${getWikipediaAPI()}?${params}`);
  const data = await response.json();
  
  if (!data.query || !data.query.pages) return null;

  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  
  if (pageId === '-1') return null;

  // On retourne l'ID mais aussi le titre final (ex: "J. R. R. Tolkien")
  return {
    id: pages[pageId].pageprops?.wikibase_item || null,
    realTitle: pages[pageId].title // Le titre après redirection
  };
}

/**
 * Récupère l'entité complète depuis Wikidata
 */
async function fetchWikidataEntity(wikidataId) {
  const response = await fetch(
    `${WIKIDATA_ENTITY_API}/${wikidataId}.json`,
    { headers: { 'Accept': 'application/json' } }
  );
  
  const data = await response.json();
  return data.entities[wikidataId];
}

/**
 * Extrait les identifiants externes (MusicBrainz, TMDB, VIAF, etc.)
 */
function extractExternalIdentifiers(wikidataEntity) {
  const identifiers = {};
  const claims = wikidataEntity.claims || {};

  const propertyMap = {
    'P434': 'musicbrainz',           // MusicBrainz artist ID
    'P1004': 'musicbrainz_work',     // MusicBrainz work ID
    'P4985': 'tmdb',                 // TMDB ID
    'P214': 'viaf',                  // VIAF ID
    'P227': 'gnd',                   // GND ID
    'P1953': 'discogs',              // Discogs artist ID
    'P646': 'freebase',              // Freebase ID
    'P648': 'openlibrary',           // Open Library ID
    'P345': 'imdb',                  // IMDb ID
    'P1233': 'isfdb_author',         // ISFDB author ID
    'P496': 'orcid',                 // ORCID (chercheurs)
    'P625': 'coordinates',           // Coordonnées géographiques
    'P18': 'image',                  // Image principale
  };

  for (const [property, name] of Object.entries(propertyMap)) {
    if (claims[property] && claims[property].length > 0) {
      const mainsnak = claims[property][0].mainsnak;
      const value = mainsnak.datavalue?.value;
      
      if (value) {
        // Gérer les coordonnées spécialement
        if (property === 'P625') {
          identifiers[name] = {
            latitude: value.latitude,
            longitude: value.longitude
          };
        } else {
          identifiers[name] = value;
        }
      }
    }
  }

  return identifiers;
}

/**
 * ENRICHISSEMENT WIKIPEDIA
 */
async function enrichFromWikipedia(entity, title) {
  try {
    // Récupérer le résumé
    const summaryResponse = await fetch(
      `${getWikipediaRestAPI()}/page/summary/${encodeURIComponent(title)}`
    );
    const summary = await summaryResponse.json();

    entity.sources.wikipedia = {
      title: summary.title,
      extract: summary.extract,
      thumbnail: summary.thumbnail?.source,
      url: summary.content_urls?.desktop?.page
    };

    // Récupérer les liens internes (pour le graphe)
    const linksParams = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'links',
      format: 'json',
      origin: '*'
    });

    const linksResponse = await fetch(`${getWikipediaAPI()}?${linksParams}`);
    const linksData = await linksResponse.json();
    
    if (linksData.parse?.links) {
      entity.sources.wikipedia.links = linksData.parse.links
        .slice(0, 50)
        .map(link => link['*']);
    }

  } catch (error) {
    console.warn('Wikipedia enrichment failed:', error);
  }
}

/**
 * ENRICHISSEMENT LIENS EXTERNES WIKIPEDIA
 * Parse les liens externes structurés (AllMusic, Discogs, IMDb, etc.)
 */
async function enrichFromWikipediaExternalLinks(entity, title) {
  try {
    // Récupérer le HTML de la page pour parser les liens externes
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'externallinks',
      format: 'json',
      origin: '*'
    });

    const response = await fetch(`${getWikipediaAPI()}?${params}`);
    const data = await response.json();
    
    if (!data.parse?.externallinks) return;

    const externalLinks = data.parse.externallinks;
    
    // Catégoriser les liens par domaine
    const categorizedLinks = {
      music: [],
      video: [],
      social: [],
      official: [],
      other: []
    };

    // Domaines musicaux
    const musicDomains = [
      'allmusic.com', 'discogs.com', 'musicbrainz.org', 
      'last.fm', 'spotify.com', 'deezer.com', 'rateyourmusic.com',
      'allaboutjazz.com', 'jazzmusicarchives.com'
    ];

    // Domaines vidéo/film
    const videoDomains = [
      'imdb.com', 'allocine.fr', 'rottentomatoes.com',
      'youtube.com', 'youtu.be', 'vimeo.com'
    ];

    // Réseaux sociaux
    const socialDomains = [
      'facebook.com', 'twitter.com', 'instagram.com',
      'linkedin.com', 'tiktok.com'
    ];

    for (const link of externalLinks) {
      try {
        const url = new URL(link);
        const domain = url.hostname.replace('www.', '');
        
        const linkObj = {
          url: link,
          domain: domain,
          display: domain.split('.')[0] // "allmusic" de "allmusic.com"
        };

        if (domain.includes('official') || domain === entity.name.toLowerCase().replace(/\s+/g, '')) {
          categorizedLinks.official.push(linkObj);
        } else if (musicDomains.some(d => domain.includes(d))) {
          categorizedLinks.music.push(linkObj);
        } else if (videoDomains.some(d => domain.includes(d))) {
          categorizedLinks.video.push(linkObj);
        } else if (socialDomains.some(d => domain.includes(d))) {
          categorizedLinks.social.push(linkObj);
        } else {
          categorizedLinks.other.push(linkObj);
        }
      } catch (e) {
        // URL invalide, ignorer
      }
    }

    // Ne garder que les catégories non vides
    entity.sources.external_links = Object.fromEntries(
      Object.entries(categorizedLinks).filter(([key, val]) => val.length > 0)
    );

    console.log('🔗 Liens externes trouvés:', Object.keys(entity.sources.external_links));

  } catch (error) {
    console.warn('External links enrichment failed:', error);
  }
}

/**
 * ENRICHISSEMENT MUSICBRAINZ (musique)
 */
async function enrichFromMusicBrainz(entity) {
  if (!entity.identifiers.musicbrainz) return;

  try {
    const mbId = entity.identifiers.musicbrainz;
    const response = await fetch(
      `${MUSICBRAINZ_API}/artist/${mbId}?fmt=json&inc=recordings+releases+url-rels`,
      { headers: { 'User-Agent': 'WikiWiki/0.1.0 (educational)' } }
    );

    // Rate limit MusicBrainz : 1 req/sec
    await new Promise(resolve => setTimeout(resolve, 1000));

    const data = await response.json();

    entity.sources.musicbrainz = {
      name: data.name,
      type: data.type,
      recordings: data.recordings?.slice(0, 20),
      releases: data.releases?.slice(0, 20),
      relations: data.relations
    };

  } catch (error) {
    console.warn('MusicBrainz enrichment failed:', error);
  }
}

/**
 * ENRICHISSEMENT TMDB (films/séries)
 */
async function enrichFromTMDB(entity) {
  if (!entity.identifiers.tmdb || !TMDB_API_KEY) return;

  try {
    const tmdbId = entity.identifiers.tmdb;
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=${CURRENT_LANG}`
    );

    const data = await response.json();

    entity.sources.tmdb = {
      title: data.title,
      overview: data.overview,
      release_date: data.release_date,
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null,
      rating: data.vote_average,
      genres: data.genres
    };

  } catch (error) {
    console.warn('TMDB enrichment failed:', error);
  }
}

/**
 * ENRICHISSEMENT OPENLIBRARY (livres)
 */
async function enrichFromOpenLibrary(entity) {
  if (!entity.identifiers.openlibrary) return;

  try {
    const olId = entity.identifiers.openlibrary;
    
    let endpoint = '';
    if (olId.startsWith('OL') && olId.includes('A')) {
      endpoint = `https://openlibrary.org/authors/${olId}.json`;
    } else if (olId.startsWith('OL') && olId.includes('W')) {
      endpoint = `https://openlibrary.org/works/${olId}.json`;
    } else {
      return;
    }

    const response = await fetch(endpoint);
    const data = await response.json();

    entity.sources.openlibrary = {
      name: data.name || data.title,
      bio: data.bio?.value || data.description?.value,
      birth_date: data.birth_date,
      death_date: data.death_date,
      works_count: data.work_count,
      cover: data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg` : null
    };

  } catch (error) {
    console.warn('OpenLibrary enrichment failed:', error);
  }
}

async function enrichFromWikimediaCommons(entity) {
  try {
    const searchTerm = entity.name;
    
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: searchTerm,
      gsrnamespace: '6',
      gsrlimit: '5',
      prop: 'imageinfo',
      // On demande thumburl en plus de url
      iiprop: 'url|size|thumburl', 
      // On définit une largeur de vignette (ex: 800px) 
      // C'est cela qui transforme les .tif en .jpg lisibles
      iiurlwidth: '800', 
      format: 'json',
      origin: '*'
    });

    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    const data = await response.json();

    if (data.query?.pages) {
      const images = Object.values(data.query.pages)
        .filter(page => page.imageinfo)
        .map(page => ({
          // On utilise le thumburl (le JPG généré) au lieu de l'URL originale
          url: page.imageinfo[0].thumburl || page.imageinfo[0].url,
          source_url: page.imageinfo[0].url, // On garde l'originale au cas où
          width: page.imageinfo[0].width,
          height: page.imageinfo[0].height,
          title: page.title
        }));

      entity.sources.wikimedia_commons = {
        images: images.slice(0, 5)
      };
    }

  } catch (error) {
    console.warn('Wikimedia Commons enrichment failed:', error);
  }
}

/**
 * ENRICHISSEMENT OPENSTREETMAP (géographie)
 */
async function enrichFromOpenStreetMap(entity) {
  if (!entity.identifiers.coordinates) return;

  try {
    const { latitude, longitude } = entity.identifiers.coordinates;
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=18`,
      { headers: { 'User-Agent': 'WikiWiki/0.1.0 (educational)' } }
    );

    const data = await response.json();

    entity.sources.openstreetmap = {
      latitude,
      longitude,
      display_name: data.display_name,
      address: data.address,
      type: data.type,
      osm_id: data.osm_id,
      map_url: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`
    };

    // Rate limit Nominatim : 1 req/sec
    await new Promise(resolve => setTimeout(resolve, 1000));

  } catch (error) {
    console.warn('OpenStreetMap enrichment failed:', error);
  }
}

/**
 * ENRICHISSEMENT ARXIV (articles scientifiques)
 */
async function enrichFromArxiv(entity) {
  // Uniquement pour concepts scientifiques
  if (entity.type !== 'concept') return;

  try {
    const searchTerm = encodeURIComponent(entity.name);
    const response = await fetch(
      `http://export.arxiv.org/api/query?search_query=all:${searchTerm}&start=0&max_results=5`
    );

    const xmlText = await response.text();
    
    // Parse XML simple
    const entries = xmlText.match(/<entry>[\s\S]*?<\/entry>/g);
    
    if (entries) {
      const papers = entries.slice(0, 3).map(entry => {
        const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
        const summary = entry.match(/<summary>(.*?)<\/summary>/)?.[1];
        const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
        const id = entry.match(/<id>(.*?)<\/id>/)?.[1];
        
        return { title, summary, published, url: id };
      });

      entity.sources.arxiv = { papers };
    }

  } catch (error) {
    console.warn('arXiv enrichment failed:', error);
  }
}

/**
 * ENRICHISSEMENT ARCHIVE.ORG (adapté au type d'entité)
 */
async function enrichFromArchiveOrg(entity) {
  try {
    let searchQuery = entity.name;
    let mediaTypeFilter = '';
    
    // Adapter la recherche selon le type
    if (entity.type === 'person') {
      // Pour une personne, chercher par creator exact
      searchQuery = `creator:"${entity.name}"`;
      mediaTypeFilter = '(mediatype:audio OR mediatype:movies)';
    } else if (entity.type === 'concept') {
      // Pour un concept générique (comme "Jazz"), ne pas chercher
      // C'est trop vague et retourne n'importe quoi
      return;
    } else {
      // Pour les œuvres, chercher le titre exact
      searchQuery = `title:"${entity.name}"`;
    }
    
    const searchParams = new URLSearchParams({
      q: `${searchQuery} AND ${mediaTypeFilter}`,
      'fl[]': ['identifier', 'title', 'mediatype', 'date', 'creator', 'downloads'].join(','),
      rows: 5,
      output: 'json',
      sort: 'downloads desc' // Trier par popularité
    });

    const response = await fetch(
      `https://archive.org/advancedsearch.php?${searchParams}`
    );

    const data = await response.json();

    if (!data.response?.docs || data.response.docs.length === 0) {
      return;
    }

    const items = data.response.docs;
    
    const videos = items.filter(item => 
      item.mediatype === 'movies' || item.mediatype === 'video'
    ).slice(0, 3);

    const audio = items.filter(item => 
      item.mediatype === 'audio' || item.mediatype === 'etree'
    ).slice(0, 5);

    const texts = items.filter(item => 
      item.mediatype === 'texts'
    ).slice(0, 5);

    const enrichItem = (item) => ({
      identifier: item.identifier,
      title: item.title,
      date: item.date,
      creator: item.creator,
      downloads: item.downloads,
      url: `https://archive.org/details/${item.identifier}`,
      embed_url: `https://archive.org/embed/${item.identifier}`
    });

    entity.sources.archive_org = {
      videos: videos.map(enrichItem),
      audio: audio.map(enrichItem),
      texts: texts.map(enrichItem),
      total_results: data.response.numFound
    };

    console.log(`📼 Archive.org: ${videos.length} vidéos, ${audio.length} audios trouvés`);

  } catch (error) {
    console.warn('Archive.org enrichment failed:', error);
  }
}

/**
 * HELPERS
 */
function getLabel(entity, lang = 'en') {
  return entity.labels?.[lang]?.value || entity.labels?.['en']?.value;
}

function getDescription(entity, lang = 'en') {
  return entity.descriptions?.[lang]?.value || entity.descriptions?.['en']?.value;
}

function inferEntityType(entity) {
  const claims = entity.claims || {};
  
  // P31 = "instance of"
  if (claims.P31 && claims.P31.length > 0) {
    const instanceOf = claims.P31[0].mainsnak.datavalue?.value?.id;
    
    const typeMap = {
      'Q5': 'person',
      'Q215627': 'person',
      'Q11424': 'film',
      'Q5398426': 'series',        // série TV
      'Q571': 'book',
      'Q7725634': 'book',          // œuvre littéraire
      'Q8341': 'concept',          // genre musical
      'Q7278': 'concept',          // parti politique
      'Q515': 'place',             // ville
      'Q486972': 'place',          // établissement humain
      'Q7275': 'place',            // état
      'Q8502': 'place',            // montagne
      'Q4022': 'place',            // rivière
      'Q35127': 'concept',         // site web
      'Q28640': 'person',          // profession
      'Q1644573': 'concept',       // concept scientifique
      'Q11173': 'concept',         // composé chimique
    };

    return typeMap[instanceOf] || 'entity';
  }

  return 'entity';
}

/**
 * Change la langue de Wikipedia
 */
export function setLanguage(lang) {
  CURRENT_LANG = lang;
  console.log('🌍 Langue changée:', lang);
}

/**
 * Récupère la langue courante
 */
export function getLanguage() {
  return CURRENT_LANG;
}

/**
 * Type Entity
 * @typedef {Object} Entity
 * @property {string} id - Wikidata ID (ex: "Q105858")
 * @property {string} name - Nom de l'entité
 * @property {string} description - Description courte
 * @property {string} type - Type: person|place|work|concept|entity
 * @property {Object} identifiers - IDs externes (musicbrainz, tmdb, etc.)
 * @property {Object} sources - Données par source (wikipedia, wikidata, etc.)
 */
