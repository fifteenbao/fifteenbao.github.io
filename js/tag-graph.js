(function () {
  'use strict';

  // ── state ─────────────────────────────────────────────────────────────────
  var svg, g, zoom, simulation;
  var nodeEl, linkEl, labelEl;
  var selected = null;

  // ── theme helpers ─────────────────────────────────────────────────────────
  function isDark() {
    return document.documentElement.classList.contains('dark');
  }

  // Read a CSS token from :root / html.dark — single source of truth
  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function nodeColor(d) {
    if (d.count >= 7) return token('--heat-3');
    if (d.count >= 5) return token('--heat-4');
    if (d.count >= 3) return token('--accent');
    if (d.count >= 2) return token('--heat-2');
    return token('--heat-1');
  }

  function nodeR(d) {
    if (d.count >= 7) return 12;
    if (d.count >= 5) return 9;
    if (d.count >= 3) return 6.5;
    if (d.count >= 2) return 5;
    return 3.5;
  }

  function linkStroke()       { return token('--accent-border'); }
  function activeLinkStroke() { return token('--accent'); }
  function nodeStroke()       { return isDark() ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)'; }
  function glowFilter()       { return isDark() ? 'url(#glow-soft)' : 'none'; }
  function labelFill(d) {
    var hi = token('--text-primary');
    var lo = token('--text-secondary');
    return d.count >= 3 ? hi : lo;
  }

  // ── entry ─────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var data = window.GRAPH_DATA;
    if (!data || !data.tags || !data.tags.length) {
      var el = document.getElementById('graph-loading');
      if (el) el.textContent = '暂无标签数据';
      return;
    }

    var nodes = data.tags.map(function (t) { return Object.assign({}, t); });
    var links = buildLinks(nodes, data.posts || []);

    var loadingEl = document.getElementById('graph-loading');
    if (loadingEl) loadingEl.remove();

    var statsEl = document.getElementById('graph-stats');
    if (statsEl) statsEl.textContent = nodes.length + ' 个标签 · ' + links.length + ' 个关联';

    renderGraph(nodes, links);

    // Zoom controls
    bindBtn('ctrl-zoom-in',  function () { svg.transition().duration(280).call(zoom.scaleBy, 1.35); });
    bindBtn('ctrl-zoom-out', function () { svg.transition().duration(280).call(zoom.scaleBy, 0.75); });
    bindBtn('ctrl-reset',    resetView);

    // Watch for theme toggle
    new MutationObserver(function () { updateColors(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  function bindBtn(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // ── co-occurrence links ───────────────────────────────────────────────────
  function buildLinks(nodes, posts) {
    var co = {};
    posts.forEach(function (post) {
      var tags = post.tags;
      if (!tags || tags.length < 2) return;
      for (var i = 0; i < tags.length; i++) {
        for (var j = i + 1; j < tags.length; j++) {
          var key = [tags[i], tags[j]].sort().join('\x00');
          co[key] = (co[key] || 0) + 1;
        }
      }
    });
    var nodeIds = new Set(nodes.map(function (n) { return n.id; }));
    return Object.keys(co).reduce(function (acc, key) {
      var parts = key.split('\x00');
      if (nodeIds.has(parts[0]) && nodeIds.has(parts[1])) {
        acc.push({ source: parts[0], target: parts[1], value: co[key] });
      }
      return acc;
    }, []);
  }

  // ── SVG glow filter ───────────────────────────────────────────────────────
  function addGlowFilter(defs, id, blur) {
    var f = defs.append('filter').attr('id', id)
      .attr('x', '-100%').attr('y', '-100%')
      .attr('width', '300%').attr('height', '300%');
    f.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', blur).attr('result', 'blur');
    var m = f.append('feMerge');
    m.append('feMergeNode').attr('in', 'blur');
    m.append('feMergeNode').attr('in', 'SourceGraphic');
  }

  // ── render ────────────────────────────────────────────────────────────────
  function renderGraph(nodes, links) {
    var container = document.getElementById('graph');
    if (!container) return;

    var W = container.clientWidth  || 900;
    var H = container.clientHeight || 600;

    d3.select('#graph').selectAll('*').remove();

    svg = d3.select('#graph').append('svg')
      .attr('width', W).attr('height', H)
      .style('display', 'block');

    var defs = svg.append('defs');
    addGlowFilter(defs, 'glow-soft',     3);
    addGlowFilter(defs, 'glow-selected', 7);
    addGlowFilter(defs, 'glow-hover',    4.5);

    zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', function (e) { g.attr('transform', e.transform); });

    svg.call(zoom).on('click.deselect', function (e) {
      if (e.target === svg.node()) deselect();
    });

    g = svg.append('g');

    // ── Tighter physics ──────────────────────────────────────────────────
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; })
        // Shorter link distance → nodes pulled much closer together
        .distance(function (d) { return Math.max(28, 60 - d.value * 8); })
        .strength(0.7))
      .force('charge', d3.forceManyBody()
        // Reduced repulsion → tighter cluster
        .strength(function (d) { return -80 - nodeR(d) * 10; }))
      .force('center', d3.forceCenter(W / 2, H / 2))
      // Extra gravity toward center → prevents nodes flying to edges
      .force('x', d3.forceX(W / 2).strength(0.04))
      .force('y', d3.forceY(H / 2).strength(0.04))
      .force('collision', d3.forceCollide()
        .radius(function (d) { return nodeR(d) + 8; }));

    // Links
    linkEl = g.append('g').attr('class', 'links')
      .selectAll('line').data(links).enter().append('line')
      .attr('stroke', linkStroke())
      .attr('stroke-width', function (d) { return Math.max(0.8, d.value * 0.7); });

    // Nodes
    nodeEl = g.append('g').attr('class', 'nodes')
      .selectAll('circle').data(nodes).enter().append('circle')
      .attr('r', nodeR)
      .attr('fill', nodeColor)
      .attr('stroke', nodeStroke())
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .style('filter', glowFilter())
      .on('click', onNodeClick)
      .on('mouseover', onHover)
      .on('mouseout', onHoverOut)
      .call(d3.drag()
        .on('start', dragStart)
        .on('drag',  dragged)
        .on('end',   dragEnd));

    // Labels
    labelEl = g.append('g').attr('class', 'labels')
      .selectAll('text').data(nodes).enter().append('text')
      .text(function (d) { return d.name; })
      .attr('fill', function (d) { return labelFill(d); })
      .attr('font-size', function (d) { return d.count >= 4 ? '11.5px' : '9.5px'; })
      .attr('font-family', 'system-ui, -apple-system, sans-serif')
      .attr('font-weight', function (d) { return d.count >= 5 ? '500' : '400'; })
      .attr('dx', function (d) { return nodeR(d) + 4; })
      .attr('dy', '0.35em')
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    simulation.on('tick', function () {
      linkEl
        .attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
      nodeEl.attr('cx', function (d) { return d.x; }).attr('cy', function (d) { return d.y; });
      labelEl.attr('x', function (d) { return d.x; }).attr('y', function (d) { return d.y; });
    });

    window.addEventListener('resize', onResize);
  }

  // ── update colors on theme change ────────────────────────────────────────
  function updateColors() {
    if (!nodeEl) return;
    var dark = isDark();
    nodeEl
      .style('filter', function (d) {
        if (d === selected) return dark ? 'url(#glow-selected)' : 'none';
        return dark ? 'url(#glow-soft)' : 'none';
      })
      .attr('stroke', function (d) {
        if (d === selected) return '#f59e0b';
        return nodeStroke();
      });
    linkEl.attr('stroke', function (l) {
      if (selected && (l.source.id === selected.id || l.target.id === selected.id)) {
        return activeLinkStroke();
      }
      return linkStroke();
    });
    labelEl.attr('fill', function (d) { return labelFill(d); });
  }

  // ── interactions ──────────────────────────────────────────────────────────
  function selectNode(d) {
    selected = d;
    var dark = isDark();

    var neighbors = new Set([d.id]);
    linkEl.each(function (l) {
      if (l.source.id === d.id) neighbors.add(l.target.id);
      if (l.target.id === d.id) neighbors.add(l.source.id);
    });

    nodeEl
      .attr('opacity',      function (n) { return neighbors.has(n.id) ? 1 : 0.12; })
      .style('filter',      function (n) {
        if (n.id === d.id) return dark ? 'url(#glow-selected)' : 'none';
        return dark ? 'url(#glow-soft)' : 'none';
      })
      .attr('stroke',       function (n) { return n.id === d.id ? '#f59e0b' : nodeStroke(); })
      .attr('stroke-width', function (n) { return n.id === d.id ? 2.5 : 1; });

    linkEl
      .attr('opacity', function (l) {
        return (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.05;
      })
      .attr('stroke', function (l) {
        return (l.source.id === d.id || l.target.id === d.id)
          ? activeLinkStroke() : linkStroke();
      });

    labelEl.attr('opacity', function (n) { return neighbors.has(n.id) ? 1 : 0.08; });

    showPanel(d);
  }

  function deselect() {
    selected = null;
    nodeEl
      .attr('opacity', 1)
      .style('filter', glowFilter())
      .attr('stroke', nodeStroke())
      .attr('stroke-width', 1);
    linkEl.attr('opacity', 1).attr('stroke', linkStroke());
    labelEl.attr('opacity', 1);
    var panel = document.getElementById('tag-panel');
    if (panel) panel.classList.remove('visible');
  }

  function onNodeClick(event, d) {
    event.stopPropagation();
    if (selected && selected.id === d.id) { deselect(); return; }
    selectNode(d);
  }

  function onHover(event, d) {
    if (d !== selected) {
      d3.select(this)
        .style('filter', isDark() ? 'url(#glow-hover)' : 'none')
        .attr('stroke', isDark() ? 'rgba(255,255,255,0.5)' : 'rgba(79,70,229,0.6)');
    }
  }

  function onHoverOut(event, d) {
    if (d !== selected) {
      d3.select(this)
        .style('filter', glowFilter())
        .attr('stroke', nodeStroke());
    }
  }

  // ── detail panel ──────────────────────────────────────────────────────────
  function showPanel(d) {
    var panel = document.getElementById('tag-panel');
    if (!panel) return;
    panel.classList.add('visible');

    var connected = [];
    linkEl.each(function (l) {
      if (l.source.id === d.id) connected.push(l.target);
      if (l.target.id === d.id) connected.push(l.source);
    });

    var html = '<div class="tp-header">'
      + '<div><div class="tp-title">' + esc(d.name) + '</div>'
      + '<div class="tp-meta">' + d.count + ' 篇 · ' + connected.length + ' 个关联</div></div>'
      + '<button class="tp-close" onclick="(function(){document.getElementById(\'tag-panel\').classList.remove(\'visible\');})()">'
      + '✕</button></div>';

    if (d.url) {
      html += '<a href="' + d.url + '" class="tp-view-all">查看全部文章 →</a>';
    }

    if (connected.length) {
      html += '<div class="tp-section-title">关联标签</div><div class="tp-tags">';
      connected.forEach(function (t) {
        html += '<span class="tp-tag" data-id="' + escAttr(t.id) + '">'
          + esc(t.name) + '<span class="tp-tag-count">' + t.count + '</span></span>';
      });
      html += '</div>';
    }

    if (d.articles && d.articles.length) {
      html += '<div class="tp-section-title">相关文章</div><div class="tp-articles">';
      d.articles.forEach(function (a) {
        html += '<a href="' + a.url + '" class="tp-article">' + esc(a.title) + '</a>';
      });
      html += '</div>';
    }

    panel.innerHTML = html;

    panel.querySelectorAll('.tp-tag[data-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        nodeEl.each(function (n) { if (n.id === id) selectNode(n); });
      });
    });
  }

  // ── utilities ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  function resetView() {
    if (!svg) return;
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  }

  function dragStart(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d)  { d.fx = event.x; d.fy = event.y; }
  function dragEnd(event, d)  {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  function onResize() {
    if (!svg || !simulation) return;
    var c = document.getElementById('graph');
    if (!c) return;
    var W = c.clientWidth, H = c.clientHeight;
    svg.attr('width', W).attr('height', H);
    simulation
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('x', d3.forceX(W / 2).strength(0.04))
      .force('y', d3.forceY(H / 2).strength(0.04))
      .alpha(0.3).restart();
  }

})();
