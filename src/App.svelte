<script>
  import { onMount } from 'svelte';
  import { resolveEntity, resolveEntityFromCandidate, getLanguage } from './lib/entityResolver.js';
  import { buildGraph } from './lib/graphBuilder.js';

  let searchQuery = '';
  let loading = false;
  let entity = null;
  let graph = null;
  let error = null;
  let candidates = null; // ← Nouveau

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    
    loading = true;
    error = null;
    entity = null;
    graph = null;
    candidates = null; // ← Reset

    try {
      console.log('Resolving entity:', searchQuery);
      const result = await resolveEntity(searchQuery);
      
      // Vérifier si c'est une désambiguïsation
      if (result.needsDisambiguation) {
        candidates = result.candidates;
        console.log('Désambiguïsation nécessaire:', candidates);
      } else {
        entity = result;
        console.log('Entity resolved:', entity);

        console.log('Building graph...');
        graph = await buildGraph(entity, 1);
        console.log('Graph built:', graph);
      }

    } catch (err) {
      error = err.message;
      console.error('Error:', err);
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
</script>

<div class="app">
  <header>
    <h1>WIKIWIKI</h1>
    <div class="lang-info">🌍 Wikipedia: {getLanguage().toUpperCase()}</div>
    <div class="search-bar">
      <input 
        type="text" 
        bind:value={searchQuery}
        on:keydown={handleKeydown}
        placeholder="Rechercher un sujet (ex: Sidney Bechet, Jazz, Quartz...)"
        disabled={loading}
      />
      <button on:click={handleSearch} disabled={loading || !searchQuery.trim()}>
        {loading ? '⏳' : '🔍'}
      </button>
    </div>
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
        <h2>Entité Résolue</h2>
        <div class="entity-card">
          <h3>{entity.name}</h3>
          <p class="wikidata-id">Wikidata: {entity.id}</p>
          
          {#if entity.description}
            <p class="description">{entity.description}</p>
          {/if}

          <div class="sources">
            <h4>Sources disponibles:</h4>
            <ul>
              {#each Object.keys(entity.sources) as source}
                <li>{source}</li>
              {/each}
            </ul>
          </div>

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
        </div>
      </div>
    {/if}

    {#if graph}
      <div class="graph-preview">
        <h2>Graphe Construit</h2>
        <p>Nœuds: {graph.nodes.length} | Liens: {graph.edges.length}</p>
        
        <div class="nodes-list">
          <h4>Nœuds connectés:</h4>
          <ul>
            {#each graph.nodes.slice(0, 10) as node}
              <li>{node.label} ({node.type})</li>
            {/each}
            {#if graph.nodes.length > 10}
              <li>... et {graph.nodes.length - 10} autres</li>
            {/if}
          </ul>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
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
</style>
