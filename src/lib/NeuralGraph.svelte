<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import * as d3 from 'd3';

  export let graph; // Les données { nodes, edges }

  const dispatch = createEventDispatcher();
  let svgElement;
  let width = 800;
  let height = 600;

  // On relance la simulation dès que les données 'graph' changent
  $: if (graph && svgElement) {
    updateGraph();
  }

  function updateGraph() {
    const svg = d3.select(svgElement);
    svg.selectAll("*").remove(); // Nettoyage

    // 1. Définition des forces
    const simulation = d3.forceSimulation(graph.nodes)
      .force("link", d3.forceLink(graph.edges)
        .id(d => d.id)
        .distance(d => 150 - (d.value * 30))) // Plus le score est haut, plus c'est proche
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(60));

    // 2. Création des liens (axones)
    const link = svg.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graph.edges)
      .enter().append("line")
      .attr("stroke", "#4a9eff")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", d => d.value * 1.5); // Épaisseur selon score

    // 3. Création des nœuds (neurones)
    const node = svg.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graph.nodes)
      .enter().append("g")
      .attr("class", "node-group")
      .on("click", (event, d) => {
        dispatch('selectNode', { id: d.id, label: d.label });
      })
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Masque circulaire pour l'image
    const defs = svg.append("defs");
    node.each(function(d) {
      defs.append("clipPath")
        .attr("id", `clip-${d.index}`)
        .append("circle")
        .attr("r", d.isCenter ? 35 : 25);
    });

    // Cercle de fond (halo)
    node.append("circle")
      .attr("r", d => d.isCenter ? 38 : 28)
      .attr("fill", "none")
      .attr("stroke", d => d.isCenter ? "#4a9eff" : "#2c3e50")
      .attr("stroke-width", 2)
      .attr("class", "node-halo");

    // Image du nœud
    node.append("image")
      .attr("xlink:href", d => d.thumbnail || 'https://www.wikidata.org/static/images/icons/Wikipedia-logo-v2.png')
      .attr("clip-path", d => `url(#clip-${d.index})`)
      .attr("x", d => d.isCenter ? -35 : -25)
      .attr("y", d => d.isCenter ? -35 : -25)
      .attr("width", d => d.isCenter ? 70 : 50)
      .attr("height", d => d.isCenter ? 70 : 50)
      .attr("preserveAspectRatio", "xMidYMid slice");

    // Label texte
    node.append("text")
      .text(d => d.label)
      .attr("dy", d => d.isCenter ? 55 : 45)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .style("font-size", d => d.isCenter ? "14px" : "11px")
      .style("font-weight", d => d.isCenter ? "bold" : "normal")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,0.8)");

    // 4. Animation (Tick)
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Fonctions de drag
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  }
</script>

<div class="graph-container">
  <svg bind:this={svgElement} {width} {height}></svg>
</div>

<style>
  .graph-container {
    width: 100%;
    background: radial-gradient(circle at center, #1a1f2c 0%, #0b0e14 100%);
    border-radius: 12px;
    overflow: hidden;
    cursor: grab;
    margin: 1rem 0;
    border: 1px solid #2c3e50;
  }

  .graph-container:active {
    cursor: grabbing;
  }

  :global(.node-group) {
    cursor: pointer;
    transition: filter 0.2s;
  }

  :global(.node-group:hover) {
    filter: brightness(1.2);
  }

  :global(.node-halo) {
    transition: stroke 0.3s;
  }
</style>