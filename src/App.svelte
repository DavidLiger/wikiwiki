<script>
  import { onMount } from 'svelte';
  import { resolveEntity, resolveEntityFromCandidate, getLanguage } from './lib/entityResolver.js';
  import { buildGraph } from './lib/graphBuilder.js';
  import NeuralGraph from './lib/NeuralGraph.svelte';

  let searchQuery = '';
  let loading = false;
  let entity = null;
  let graph = null;
  let error = null;
  let candidates = null; // ← Nouveau
  let history = [];
  let isSearchOpen = false;
  let autocompleteResults = [];
  let debounceTimer;

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    
    loading = true;
    error = null;
    candidates = null; // On cache les anciens candidats
    // Note: on ne reset pas 'entity' et 'graph' tout de suite pour éviter un flash blanc
    
    try {
      console.log('Resolving entity:', searchQuery);
      const result = await resolveEntity(searchQuery);
      
      if (result.needsDisambiguation) {
        // Cas 1 : Plusieurs choix possibles
        candidates = result.candidates;
        entity = null;
        graph = null;
        console.log('Désambiguïsation nécessaire:', candidates);
      } else {
        // Cas 2 : Entité trouvée directement
        entity = result;
        
        // --- MISE À JOUR DE L'HISTORIQUE ---
        updateHistory(entity.id, entity.name);

        console.log('Building graph...');
        graph = await buildGraph(entity, 1);
        console.log('Graph built:', graph);
      }

    } catch (err) {
      error = err.message;
      console.error('Error:', err);
      entity = null;
      graph = null;
    } finally {
      loading = false;
    }
  }

  async function selectCandidate(candidate) {
    loading = true;
    error = null;
    candidates = null;

    try {
      entity = await resolveEntityFromCandidate(candidate.title, candidate.wikidataId);
      console.log('Entity resolved:', entity);
      updateHistory(entity.id, entity.name);
      graph = await buildGraph(entity, 1);
      console.log('Graph built:', graph);

    } catch (err) {
      error = err.message;
      console.error('Error:', err);
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') handleSearch();
  }

  async function handleNodeClick(event) {
    const { id, label } = event.detail;
    
    // On ne met PAS loading = true tout de suite pour ne pas tout bloquer
    // On lance la résolution en arrière-plan
    try {
      // 1. On récupère les données de la nouvelle entité (pour la Card)
      // Si c'est un Qid, on résout par ID, sinon par titre
      const newEntity = id.startsWith('Q') 
        ? await resolveEntityFromCandidate(label, id)
        : await resolveEntity(label);

      // 2. On met à jour l'entité (La Card va changer instantanément)
      entity = newEntity;
      updateHistory(entity.id, entity.name);

      // 3. On génère le nouveau graphe
      const newGraph = await buildGraph(entity, 1);
      
      // 4. On met à jour la variable 'graph'
      // Svelte va passer cette nouvelle valeur au composant NeuralGraph
      graph = newGraph;

    } catch (err) {
      error = err.message;
    }
  }

    // Fonction pour mettre à jour l'historique sans doublons consécutifs
  function updateHistory(id, name) {
    // Si l'entité est déjà dans l'historique, on coupe l'historique à ce niveau (retour en arrière)
    const index = history.findIndex(item => item.id === id);
    if (index !== -1) {
      history = history.slice(0, index + 1);
    } else {
      history = [...history, { id, name }];
    }
  }

  // Fonction pour cliquer sur un élément du breadcrumb
  async function navigateBack(item) {
      if (loading) return;
      
      loading = true;
      error = null;
      candidates = null; // On s'assure de cacher les suggestions

      try {
        console.log('Retour historique vers :', item.name, item.id);
        
        // On utilise l'ID précis pour éviter la désambiguïsation
        const result = await resolveEntityFromCandidate(item.name, item.id);
        
        entity = result;
        // updateHistory va détecter que l'ID existe déjà et "couper" le breadcrumb au bon endroit
        updateHistory(entity.id, entity.name);

        console.log('Mise à jour du graphe...');
        graph = await buildGraph(entity, 1);
        
      } catch (err) {
        error = err.message;
        console.error('Erreur retour arrière:', err);
      } finally {
        loading = false;
      }
    }
  
  // Fonction pour basculer la barre de recherche
  function toggleSearch() {
    isSearchOpen = !isSearchOpen;
    if (!isSearchOpen) {
      autocompleteResults = [];
      searchQuery = "";
    }
  }

  // Autocomplétion avec "Debounce" pour ne pas surcharger l'API
  async function handleInput() {
    clearTimeout(debounceTimer);
    if (searchQuery.length < 2) {
      autocompleteResults = [];
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        // On réutilise ta fonction searchWikipedia
        const results = await searchWikipedia(searchQuery);
        autocompleteResults = results;
      } catch (err) {
        console.error("Autocomp error:", err);
      }
    }, 300); // Attend 300ms après la fin de la frappe
  }

  // Sélection d'une suggestion
  function selectSuggestion(title) {
    searchQuery = title;
    autocompleteResults = [];
    isSearchOpen = false;
    handleSearch();
  }
</script>

<div class="app">
  <header class="app-header">
    <div class="header-top">
      <div class="brand-zone">
        <span class="icon-book">📖</span>
        <h1 class="logo">wikiwiki</h1>
      </div>
      <button class="search-toggle" on:click={toggleSearch}>
        {isSearchOpen ? '✕' : '🔍'}
      </button>
    </div>

    {#if isSearchOpen}
      <div class="search-overlay">
        <div class="search-input-wrapper">
          <input 
            type="text" 
            bind:value={searchQuery}
            on:input={handleInput}
            on:keydown={handleKeydown}
            placeholder="Rechercher..."
            autoFocus
          />
        </div>
        
        {#if autocompleteResults.length > 0}
          <ul class="autocomplete-list">
            {#each autocompleteResults as res}
              <li>
                <button on:click={() => selectSuggestion(res)}>
                  🔍 {res}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    {#if history.length > 0 && !isSearchOpen}
      <nav class="breadcrumb-mobile">
        {#each history as item, i}
          <button class:active={i === history.length-1} on:click={() => navigateBack(item)}>
            {item.name}
          </button>
          {#if i < history.length - 1}<span>›</span>{/if}
        {/each}
      </nav>
    {/if}
  </header>

  <main>
    {#if loading}
      <div class="status">Chargement...</div>
    {/if}

    {#if error}
      <div class="error">Erreur : {error}</div>
    {/if}

    {#if candidates}
      <div class="disambiguation">
        <h2>Plusieurs résultats trouvés</h2>
        <p>Choisissez celui qui vous intéresse :</p>
        <div class="candidates-list">
          {#each candidates as candidate}
            <button class="candidate-btn" on:click={() => selectCandidate(candidate)}>
              <strong>{candidate.title}</strong>
              <small>Wikidata: {candidate.wikidataId}</small>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if entity}
      <!-- Reste du code identique -->
      <div class="result">
        <div class="entity-card">
          <h3>{entity.name}</h3>
          <p class="wikidata-id">Wikidata: {entity.id}</p>
          
          {#if entity.description}
            <p class="description">{entity.description}</p>
          {/if}

          {#if entity.sources.wikipedia?.extract}
            <div class="extract">
              <h4>Extrait Wikipedia:</h4>
              <p>{entity.sources.wikipedia.extract}</p>
            </div>
          {/if}
          {#if entity.sources.archive_org}
            <div class="archive-org">
              <h4>Archive.org:</h4>
              
              {#if entity.sources.archive_org.videos.length > 0}
                <div class="media-section">
                  <h5>🎬 Vidéos ({entity.sources.archive_org.videos.length})</h5>
                  <ul>
                    {#each entity.sources.archive_org.videos as video}
                      <li>
                        <a href={video.url} target="_blank" rel="noopener">
                          {video.title}
                        </a>
                        {#if video.date}
                          <small>({video.date})</small>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if entity.sources.archive_org.audio.length > 0}
                <div class="media-section">
                  <h5>🎵 Audio ({entity.sources.archive_org.audio.length})</h5>
                  <ul>
                    {#each entity.sources.archive_org.audio as track}
                      <li>
                        <a href={track.url} target="_blank" rel="noopener">
                          {track.title}
                        </a>
                        {#if track.date}
                          <small>({track.date})</small>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if entity.sources.archive_org.texts?.length > 0}
                <div class="media-section">
                  <h5>📚 Textes ({entity.sources.archive_org.texts.length})</h5>
                  <ul>
                    {#each entity.sources.archive_org.texts as text}
                      <li>
                        <a href={text.url} target="_blank" rel="noopener">
                          {text.title}
                        </a>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/if}
          <!-- ... après le bloc Wikipedia ... -->

          {#if entity.sources.wikimedia_commons?.images?.length > 0}
            <div class="section-data">
              <h4>🖼️ Images (Wikimedia Commons)</h4>
              <div class="image-gallery">
                {#each entity.sources.wikimedia_commons.images as img}
                  <a href={img.source_url} target="_blank" title="Voir l'original (haute résolution)">
                    <img src={img.url} alt={img.title} class="gallery-thumb" />
                  </a>
                {/each}
              </div>
            </div>
          {/if}

          {#if entity.sources.openlibrary}
            <div class="section-data">
              <h4>📚 Open Library</h4>
              <div class="flex-row">
                {#if entity.sources.openlibrary.cover}
                  <img src={entity.sources.openlibrary.cover} alt="Couverture" class="book-cover" />
                {/if}
                <div>
                  <p><strong>{entity.sources.openlibrary.name}</strong></p>
                  {#if entity.sources.openlibrary.bio}
                    <p class="bio-text">{entity.sources.openlibrary.bio.substring(0, 300)}...</p>
                  {/if}
                  <p><small>Ouvrages : {entity.sources.openlibrary.works_count || 'N/A'}</small></p>
                  <a href="https://openlibrary.org/authors/{entity.identifiers.openlibrary}" target="_blank" class="link-btn">
                    Voir sur Open Library
                  </a>
                </div>
              </div>
            </div>
          {/if}

          {#if entity.sources.musicbrainz}
            <div class="section-data">
              <h4>🎵 MusicBrainz</h4>
              <p>Type d'artiste : {entity.sources.musicbrainz.type || 'Inconnu'}</p>
              
              {#if entity.sources.musicbrainz.releases?.length > 0}
                <h5>Dernières parutions :</h5>
                <ul class="release-list">
                  {#each entity.sources.musicbrainz.releases.slice(0, 5) as release}
                    <li><strong>{release.title}</strong> ({release.date || 'date inconnue'})</li>
                  {/each}
                </ul>
              {/if}
              <a href="https://musicbrainz.org/artist/{entity.identifiers.musicbrainz}" target="_blank" class="link-btn">
                Profil MusicBrainz
              </a>
            </div>
          {/if}

          <!-- ... avant les liens externes ... -->
          {#if entity.sources.external_links}
            <div class="external-links">
              <h4>🔗 Liens externes:</h4>
              
              {#if entity.sources.external_links.official}
                <div class="link-category">
                  <h5>Site officiel</h5>
                  <div class="links-grid">
                    {#each entity.sources.external_links.official as link}
                      <a href={link.url} target="_blank" rel="noopener" class="link-badge official">
                        🌐 {link.display}
                      </a>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if entity.sources.external_links.music}
                <div class="link-category">
                  <h5>🎵 Musique</h5>
                  <div class="links-grid">
                    {#each entity.sources.external_links.music as link}
                      <a href={link.url} target="_blank" rel="noopener" class="link-badge music">
                        {link.display}
                      </a>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if entity.sources.external_links.video}
                <div class="link-category">
                  <h5>🎬 Vidéo</h5>
                  <div class="links-grid">
                    {#each entity.sources.external_links.video as link}
                      <a href={link.url} target="_blank" rel="noopener" class="link-badge video">
                        {link.display}
                      </a>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if entity.sources.external_links.social}
                <div class="link-category">
                  <h5>📱 Réseaux sociaux</h5>
                  <div class="links-grid">
                    {#each entity.sources.external_links.social as link}
                      <a href={link.url} target="_blank" rel="noopener" class="link-badge social">
                        {link.display}
                      </a>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
          <div class="sources">
            <h4>Sources disponibles:</h4>
            <ul>
              {#each Object.keys(entity.sources) as source}
                <li>{source}</li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
    {/if}

    {#if graph}
      <section class="neural-section">
        <h2>Navigation Neuronale</h2>
        <NeuralGraph {graph} on:selectNode={handleNodeClick} />
        
        <div class="graph-info">
          <small>Astuce : Cliquez sur un neurone pour explorer ses connexions.</small>
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    background-color: #0b0e14;
  }

  .app-header {
    position: sticky;
    top: 0;
    z-index: 1000;
    background: rgba(11, 14, 20, 0.95);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #2c3e50;
    padding: 10px 15px;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 50px;
  }

  .brand-zone {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo {
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: -1px;
    margin: 0;
    text-transform: lowercase;
    color: #4a9eff;
  }

  .icon-book { font-size: 1.5rem; }

  .search-toggle {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 5px;
  }

  .search-overlay {
    position: absolute;
    top: 60px;
    left: 0;
    width: 100%;
    background: #1a1f2c;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    padding: 15px;
    box-sizing: border-box;
  }

  .search-input-wrapper input {
    width: 100%;
    padding: 12px 15px;
    background: #0b0e14;
    border: 1px solid #4a9eff;
    border-radius: 8px;
    color: white;
    font-size: 1rem;
    outline: none;
  }

  .autocomplete-list {
    list-style: none;
    padding: 0;
    margin: 10px 0 0 0;
    max-height: 60vh;
    overflow-y: auto;
  }

  .autocomplete-list li button {
    width: 100%;
    text-align: left;
    padding: 12px;
    background: none;
    border: none;
    border-bottom: 1px solid #2c3e50;
    color: #e0e0e0;
    font-size: 0.95rem;
  }

  /* Breadcrumb Mobile */
  .breadcrumb-mobile {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 10px 0 5px 0;
    font-size: 0.8rem;
    scrollbar-width: none;
  }
  .breadcrumb-mobile::-webkit-scrollbar { display: none; }
  
  .breadcrumb-mobile button {
    background: #1a1f2c;
    border: none;
    color: #4a9eff;
    padding: 5px 12px;
    border-radius: 15px;
    white-space: nowrap;
  }
  
  .breadcrumb-mobile button.active {
    background: #4a9eff;
    color: white;
  }
  .app {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  header {
    padding: 2rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
    color: var(--accent);
  }

  .search-bar {
    display: flex;
    gap: 0.5rem;
  }

  input {
    flex: 1;
    padding: 0.75rem 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    font-size: 1rem;
    border-radius: 4px;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
  }

  button {
    padding: 0.75rem 1.5rem;
    background: var(--accent);
    border: none;
    color: white;
    font-size: 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button:hover:not(:disabled) {
    background: #3a8eef;
  }

  main {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }

  .status, .error {
    text-align: center;
    padding: 2rem;
    font-size: 1.2rem;
  }

  .error {
    color: #ff4444;
  }

  .result, .graph-preview {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }
  .entity-card {
    transition: all 0.5s ease-in-out;
    /* Optionnel : ajouter une animation d'entrée pour le texte */
  }

  .entity-card h3 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .wikidata-id {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .description {
    margin-bottom: 1rem;
    line-height: 1.6;
  }

  .sources, .extract, .nodes-list {
    margin-top: 1rem;
  }

  .sources h4, .extract h4, .nodes-list h4 {
    margin-bottom: 0.5rem;
    color: var(--accent);
  }

  ul {
    list-style: none;
    padding-left: 1rem;
  }

  li {
    padding: 0.25rem 0;
    color: var(--text-secondary);
  }

  .extract p {
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .external-links {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.link-category {
  margin-bottom: 1rem;
}

.link-category h5 {
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}

.links-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.link-badge {
  display: inline-block;
  padding: 0.4rem 0.8rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.85rem;
  text-decoration: none;
  color: var(--text-primary);
  transition: all 0.2s;
}

.link-badge:hover {
  border-color: var(--accent);
  background: rgba(74, 158, 255, 0.1);
  transform: translateY(-2px);
}

.link-badge.official {
  border-color: #4ade80;
}

.link-badge.music {
  border-color: #f472b6;
}

.link-badge.video {
  border-color: #fb923c;
}

.link-badge.social {
  border-color: #60a5fa;
}
.section-data {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px dashed var(--border);
  }

  .section-data h4 {
    color: var(--accent);
    margin-bottom: 0.8rem;
  }

  /* Wikimedia Commons Gallery */
  .image-gallery {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 10px;
  }

  .gallery-thumb {
    height: 120px;
    border-radius: 4px;
    object-fit: cover;
    transition: transform 0.2s;
  }

  .gallery-thumb:hover {
    transform: scale(1.05);
  }

  /* Open Library & MusicBrainz */
  .flex-row {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .book-cover {
    width: 100px;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  }

  .bio-text {
    font-size: 0.9rem;
    color: var(--text-secondary);
    line-height: 1.4;
    margin-bottom: 0.5rem;
  }

  .release-list {
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .link-btn {
    display: inline-block;
    padding: 0.3rem 0.6rem;
    background: rgba(74, 158, 255, 0.1);
    border: 1px solid var(--accent);
    color: var(--accent);
    text-decoration: none;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .link-btn:hover {
    background: var(--accent);
    color: white;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border-radius: 20px;
    font-size: 0.9rem;
    overflow-x: auto;
  }

  .breadcrumb-item {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    white-space: nowrap;
    font-weight: 500;
  }

  .breadcrumb-item:hover {
    text-decoration: underline;
  }

  .breadcrumb-item:last-child {
    color: var(--text-primary);
    cursor: default;
    pointer-events: none;
  }
  .breadcrumb-item.active {
    color: var(--text-primary);
    font-weight: bold;
    cursor: default;
    opacity: 0.8;
  }
  
  .breadcrumb-item:disabled {
    pointer-events: none;
  }
  .separator {
    color: var(--text-secondary);
  }
</style>
