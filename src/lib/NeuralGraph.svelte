<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import * as d3 from 'd3';

  export let graph;

  const dispatch = createEventDispatcher();
  let svgElement;
  let width = window.innerWidth;
  let height = window.innerHeight * 0.6;

  // 1. DÉCLARATION DE LA SIMULATION (en dehors pour persistance)
  let simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id).distance(d => 150 - (d.value * 30)))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(60));

  // Réactivité Svelte
  $: if (graph && svgElement) {
    updateGraph();
  }

  function updateGraph() {
    const svg = d3.select(svgElement);
    
    if (svg.selectAll(".links").empty()) {
      svg.append("g").attr("class", "links");
      svg.append("g").attr("class", "nodes");
    }

    // --- LIENS ---
    const link = svg.select(".links")
      .selectAll("line")
      .data(graph.edges, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

    link.exit().transition().duration(500).attr("stroke-opacity", 0).remove();

    const linkEnter = link.enter().append("line")
      .attr("stroke", "#4a9eff")
      .attr("stroke-opacity", 0)
      .attr("stroke-width", d => d.value * 1.5);
    
    const allLinks = linkEnter.merge(link);
    allLinks.transition().duration(500).attr("stroke-opacity", 0.4);

    // --- NŒUDS ---
    const node = svg.select(".nodes")
      .selectAll(".node-group")
      .data(graph.nodes, d => d.id);

    node.exit().transition().duration(500)
      .attr("opacity", 0)
      .attr("transform", "scale(0)")
      .remove();

    const nodeEnter = node.enter().append("g")
      .attr("class", "node-group")
      .on("click", (event, d) => dispatch('selectNode', { id: d.id, label: d.label }))
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    nodeEnter.append("circle")
      .attr("class", "node-halo")
      .attr("fill", "none")
      .attr("stroke-width", 2);

    nodeEnter.append("image")
      .attr("preserveAspectRatio", "xMidYMid slice");

    nodeEnter.append("text")
      .attr("fill", "white")
      .attr("text-anchor", "middle");

    const allNodes = nodeEnter.merge(node);

    allNodes.select(".node-halo")
      .transition().duration(800)
      .attr("r", d => d.isCenter ? 40 : 28)
      .attr("stroke", d => d.isCenter ? "#4a9eff" : "#2c3e50");

    allNodes.select("image")
      .transition().duration(800)
      .attr("x", d => d.isCenter ? -40 : -28)
      .attr("y", d => d.isCenter ? -40 : -28)
      .attr("width", d => d.isCenter ? 80 : 56)
      .attr("height", d => d.isCenter ? 80 : 56)
      .attr("xlink:href", d => d.thumbnail || 'https://www.wikidata.org/static/images/icons/Wikipedia-logo-v2.png');

    allNodes.select("text")
      .transition().duration(800)
      .text(d => d.label)
      .attr("dy", d => d.isCenter ? 60 : 45)
      .style("font-size", d => d.isCenter ? "14px" : "11px");

    // --- MISE À JOUR PHYSIQUE ---
    simulation.nodes(graph.nodes);
    simulation.force("link").links(graph.edges);
    simulation.alpha(0.5).restart();

    simulation.on("tick", () => {
      allLinks
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      allNodes.attr("transform", d => `translate(${d.x},${d.y})`);
    });
  }

  // 2. FONCTIONS DE DRAG (re-ajoutées ici)
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