// tag-graph.js
document.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('graph');
  if (!container) {
    console.error('Graph container not found');
    return;
  }

  // Remove loading message
  const loadingMessage = document.getElementById('loading-message');
  if (loadingMessage) {
    loadingMessage.style.display = 'none';
  }

  // Get data from embedded script
  initializeWithEmbeddedData();
});

function initializeWithEmbeddedData() {
  // This function will be filled with embedded data when Hugo renders the page

  // Get data from Hugo templates - these variables will be replaced during page rendering
  const allPosts = [];
  {{- range site.RegularPages -}}
  {{- if isset .Params "tags" -}}
  allPosts.push({
    url: {{ .RelPermalink | jsonify }},
    title: {{ .Title | jsonify }},
    tags: {{ .Params.tags | jsonify }}
  });
  {{- end -}}
  {{- end -}}

  const tagsData = [];
  {{- range $name, $items := site.Taxonomies.tags -}}
  tagsData.push({
    id: {{ $name | jsonify }},
    name: {{ $name | jsonify }},
    count: {{ len $items }},
    linkedTags: [],
    articles: [
      {{- range $index, $page := $items -}}
      {{- if $index -}},{{- end -}}
      {
        title: {{ .Page.Title | jsonify }},
        url: {{ .Page.RelPermalink | jsonify }}
      }
      {{- end -}}
    ]
  });
  {{- end -}}

  if (tagsData.length === 0) {
    document.getElementById('graph').innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 70vh; font-size: 18px; color: #666;">暂无标签数据</div>';
    return;
  }

  initializeGraph(tagsData, allPosts);
}

function initializeGraph(tagsData, allPosts) {
  // Calculate tag relationships
  tagsData.forEach(tag => {
    tag.linkedTags = [];
    allPosts.forEach(post => {
      if (post.tags && post.tags.includes(tag.id)) {
        if (post.tags && Array.isArray(post.tags)) {
          post.tags.forEach(otherTag => {
            if (otherTag !== tag.id && !tag.linkedTags.includes(otherTag)) {
              tag.linkedTags.push(otherTag);
            }
          });
        }
      }
    });
  });

  // Create links based on tag relationships
  const links = [];
  tagsData.forEach(tag => {
    tag.linkedTags.forEach(linkedTagId => {
      const linkedTag = tagsData.find(t => t.id === linkedTagId);
      if (linkedTag) {
        // Calculate link strength based on how many posts share these tags
        let sharedCount = 0;
        allPosts.forEach(post => {
          if (post.tags && post.tags.includes(tag.id) && post.tags.includes(linkedTagId)) {
            sharedCount++;
          }
        });

        links.push({
          source: tag.id,
          target: linkedTagId,
          value: sharedCount
        });
      }
    });
  });

  // Remove duplicate links
  const uniqueLinks = [];
  const linkSet = new Set();
  links.forEach(link => {
    const key = [link.source, link.target].sort().join('-');
    if (!linkSet.has(key)) {
      linkSet.add(key);
      uniqueLinks.push(link);
    }
  });

  // Set up dimensions
  const container = document.getElementById('graph');
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Clear any existing SVG
  d3.select("#graph").selectAll("svg").remove();

  // Set up SVG
  const svg = d3.select("#graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Add zoom functionality
  const g = svg.append("g");

  // Add zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 8])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Add zoom controls
  const zoomControls = svg.append("g")
    .attr("class", "graph-zoom-controls");

  // Zoom buttons
  const zoomInBtn = zoomControls.append("g")
    .attr("class", "graph-zoom-btn")
    .attr("transform", "translate(0, 0)")
    .on("click", () => svg.transition().call(zoom.scaleBy, 1.2));

  zoomInBtn.append("text")
    .attr("x", 8)
    .attr("y", 18)
    .text("+")
    .style("font-size", "18px")
    .style("font-weight", "bold")
    .style("text-anchor", "middle")
    .style("alignment-baseline", "middle");

  const zoomOutBtn = zoomControls.append("g")
    .attr("class", "graph-zoom-btn")
    .attr("transform", "translate(0, 35)")
    .on("click", () => svg.transition().call(zoom.scaleBy, 0.8));

  zoomOutBtn.append("text")
    .attr("x", 8)
    .attr("y", 18)
    .text("−")
    .style("font-size", "20px")
    .style("font-weight", "bold")
    .style("text-anchor", "middle")
    .style("alignment-baseline", "middle");

  const zoomResetBtn = zoomControls.append("g")
    .attr("class", "graph-zoom-btn")
    .attr("transform", "translate(0, 70)")
    .on("click", () => svg.transition().call(zoom.translateTo, width/2, height/2).call(zoom.scaleTo, 1));

  zoomResetBtn.append("text")
    .attr("x", 8)
    .attr("y", 18)
    .text("↺")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .style("text-anchor", "middle")
    .style("alignment-baseline", "middle");

  // Define simulation
  const simulation = d3.forceSimulation(tagsData)
    .force("link", d3.forceLink(uniqueLinks).id(d => d.id).distance(getLinkDistance))
    .force("charge", d3.forceManyBody().strength(getChargeStrength))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(d => getNodeRadius(d) + 5));

  // Add links
  const link = g.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(uniqueLinks)
    .enter()
    .append("line")
    .attr("class", "graph-link")
    .attr("stroke-width", d => Math.max(1, Math.sqrt(d.value)));

  // Add nodes
  const node = g.append("g")
    .attr("class", "nodes")
    .selectAll("circle")
    .data(tagsData)
    .enter()
    .append("circle")
    .attr("class", function(d) {
      if (d.count > 5) return "graph-node popular";
      else if (d.count > 2) return "graph-node medium-popularity";
      else return "graph-node less-popular";
    })
    .attr("r", getNodeRadius)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));

  // Add labels
  const label = g.append("g")
    .attr("class", "labels")
    .selectAll("text")
    .data(tagsData)
    .enter()
    .append("text")
    .text(d => d.name)
    .attr("class", "graph-label")
    .attr("dx", d => getNodeRadius(d) + 5)
    .attr("dy", 4);

  // Update node positions on tick
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  });

  // Drag functions
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Event listeners for controls
  document.getElementById('nodeSize').addEventListener('input', updateNodeSize);
  document.getElementById('linkDistance').addEventListener('input', updateLinkDistance);
  document.getElementById('chargeStrength').addEventListener('input', updateChargeStrength);

  function updateNodeSize() {
    node.attr("r", getNodeRadius);
    simulation.force("collision", d3.forceCollide().radius(d => getNodeRadius(d) + 5));
    simulation.alpha(0.3).restart();
  }

  function updateLinkDistance() {
    simulation.force("link").distance(getLinkDistance);
    simulation.alpha(0.3).restart();
  }

  function updateChargeStrength() {
    simulation.force("charge").strength(getChargeStrength);
    simulation.alpha(0.3).restart();
  }

  function getNodeRadius(d) {
    const baseSize = parseInt(document.getElementById('nodeSize').value);
    return Math.max(baseSize, baseSize * Math.log(d.count + 1) * 0.8);
  }

  function getLinkDistance() {
    return parseInt(document.getElementById('linkDistance').value);
  }

  function getChargeStrength() {
    return parseInt(document.getElementById('chargeStrength').value);
  }

  function restartSimulation() {
    simulation.alpha(1).restart();
  }

  // Add click event to nodes
  node.on('click', function(event, d) {
    // Highlight clicked node and connected links
    node.attr("stroke", "#fff").attr("stroke-width", 1.5);
    d3.select(this).attr("stroke", "#f59e0b").attr("stroke-width", 3);

    // Highlight related links
    link.attr("class", "graph-link").attr("stroke", "#cbd5e1");
    link.filter(l => l.source.id === d.id || l.target.id === d.id)
         .attr("class", "graph-link active")
         .attr("stroke", "#4f46e5");

    // Show tag info
    const tagDetails = document.getElementById('tag-details');
    let tagDetailHTML = '<div class="flex items-start justify-between">';
    tagDetailHTML += '<h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">' + d.name + ' <span class="text-sm font-normal text-gray-500 dark:text-gray-400">(' + d.count + ' 篇文章)</span></h4>';
    tagDetailHTML += '<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100">';
    tagDetailHTML += d.linkedTags.length + ' 个连接';
    tagDetailHTML += '</span></div>';

    tagDetailHTML += '<div class="mb-4">';
    tagDetailHTML += '<h5 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">相关标签:</h5>';
    tagDetailHTML += '<div class="connected-tags">';

    const limitedLinkedTags = d.linkedTags.slice(0, 15);
    for (let i = 0; i < limitedLinkedTags.length; i++) {
      tagDetailHTML += '<span class="tag-badge">' + limitedLinkedTags[i] + '</span>';
    }

    if (d.linkedTags.length > 15) {
      tagDetailHTML += '<span class="text-xs text-gray-500">+' + (d.linkedTags.length - 15) + ' 更多</span>';
    }

    tagDetailHTML += '</div></div>';

    tagDetailHTML += '<div><h5 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">相关文章:</h5>';
    tagDetailHTML += '<div class="tag-article-list"><ul class="space-y-1">';

    const limitedArticles = d.articles.slice(0, 8);
    for (let i = 0; i < limitedArticles.length; i++) {
      tagDetailHTML += '<li><a href="' + limitedArticles[i].url + '" class="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm block truncate">';
      tagDetailHTML += limitedArticles[i].title;
      tagDetailHTML += '</a></li>';
    }

    if (d.articles.length > 8) {
      tagDetailHTML += '<li class="text-xs text-gray-500">+' + (d.articles.length - 8) + ' 更多文章</li>';
    }

    tagDetailHTML += '</ul></div></div>';

    tagDetails.innerHTML = tagDetailHTML;
  });

  // Add tooltip on hover
  node.append("title")
    .text(function(d) { return d.name + " (" + d.count + " articles)"; });

  // Handle window resize
  window.addEventListener("resize", function() {
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;

    svg.attr("width", newWidth)
       .attr("height", newHeight);

    simulation.force("center", d3.forceCenter(newWidth / 2, newHeight / 2));
    simulation.alpha(0.3).restart();
  });

  // Center the zoom controls
  setTimeout(() => {
    const controlsBB = zoomControls.node().getBBox();
    zoomControls.attr("transform", "translate(" + (width - controlsBB.width - 10) + ", 10)");
  }, 100);
}