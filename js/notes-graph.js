(() => {
  document.querySelectorAll('[data-notes-graph]:not([data-ready])').forEach(box=>{
    box.dataset.ready='true';
    const status=box.querySelector('.graph-status'),canvas=box.querySelector('.notes-graph-canvas'),list=box.querySelector('.graph-node-list'),selection=box.querySelector('.graph-selection'),retry=box.querySelector('[data-retry]');
    let simulation,observer,svg,zoom,data,active=null;
    const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
    function choose(n){active=n.id;selection.replaceChildren();const a=text('a',`打开笔记：${n.title}`);a.href=n.url;selection.append(a);
      const incoming=data.edges.filter(e=>(e.target.id||e.target)===n.id).map(e=>e.source.id||e.source),outgoing=data.edges.filter(e=>(e.source.id||e.source)===n.id).map(e=>e.target.id||e.target);
      selection.append(text('p',`引用 ${outgoing.length} 篇 · 被 ${incoming.length} 篇引用`));
      for(const [label,ids]of [['引用：',outgoing],['被引用：',incoming]]){if(!ids.length)continue;const p=text('p',label);for(const id of ids){const node=data.nodes.find(x=>x.id===id),link=text('a',node.title+' ');link.href=node.url;p.append(link);}selection.append(p);}
      if(svg){const adjacent=new Set([n.id,...incoming,...outgoing]);svg.selectAll('.graph-node').attr('opacity',d=>adjacent.has(d.id)?1:.24).classed('is-hovered',d=>d.id===n.id);svg.selectAll('.graph-link').attr('opacity',d=>(d.source.id===n.id||d.target.id===n.id)?1:.12).classed('is-active',d=>d.source.id===n.id||d.target.id===n.id);}
    }
    function populate(){
      list.replaceChildren();
      for(const n of data.nodes){const li=document.createElement('li'),a=text('a',n.title);a.href=n.url;li.append(a);list.append(li);}
    }
    function clearHover(){
      if(!svg)return;
      svg.selectAll('.graph-node').attr('opacity',1).classed('is-hovered',false);
      svg.selectAll('.graph-link').attr('opacity',1).classed('is-active',false);
      selection.replaceChildren();active=null;
    }
    function render(){
      canvas.replaceChildren();const d3=window.d3;if(!d3)throw Error('D3 unavailable');
      const w=Math.max(canvas.clientWidth,280),h=canvas.clientHeight||380,nodes=data.nodes.map(n=>({...n})),links=data.edges.map(e=>({...e}));
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      svg=d3.select(canvas).append('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','group').attr('aria-label','可打开阅读的笔记链接');const g=svg.append('g');
      const markerId='notes-arrow-'+Math.random().toString(36).slice(2);
      svg.append('defs').append('marker').attr('id',markerId).attr('viewBox','0 -4 8 8').attr('refX',19).attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto').append('path').attr('d','M0,-4L8,0L0,4').attr('fill','currentColor');
      zoom=d3.zoom().scaleExtent([.25,5]).filter(event=>(event.touches?event.touches.length===2:(event.type!=='wheel'||event.ctrlKey))).on('zoom',event=>g.attr('transform',event.transform));svg.call(zoom).on('dblclick.zoom',null);
      const edge=g.append('g').selectAll('line').data(links).join('line').attr('class','graph-link').attr('marker-end',`url(#${markerId})`);
      const node=g.append('g').selectAll('a').data(nodes).join('a')
        .attr('class','graph-node').attr('href',n=>n.url).attr('tabindex',0).attr('role','link')
        .attr('aria-label',n=>`阅读笔记：${n.title}`)
        .on('mouseenter focus',(event,n)=>choose(n))
        .on('mouseleave blur',clearHover);
      node.append('title').text(n=>`阅读：${n.title}`);
      node.append('circle').attr('class','graph-hit').attr('r',22);
      node.append('circle').attr('r',n=>n.id===box.dataset.center?8:6).attr('class',n=>'graph-dot'+(n.id===box.dataset.center?' is-center':'')+(n.kind==='moc'?' is-moc':''));
      node.append('text').attr('class','graph-label').attr('x',11).attr('dy',4).text(n=>n.title);
      simulation=d3.forceSimulation(nodes).force('link',d3.forceLink(links).id(n=>n.id).distance(100)).force('charge',d3.forceManyBody().strength(-130)).force('center',d3.forceCenter(w/2,h/2)).force('collide',d3.forceCollide(25)).stop();
      const tick=()=>{edge.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);node.attr('transform',n=>`translate(${n.x},${n.y})`);};
      // A bounded initial layout is deterministic and never starts an endless render loop.
      simulation.tick(nodes.length>200?60:120);tick();
      const bounds=g.node().getBBox(),scale=Math.min(1,(w-32)/Math.max(bounds.width,1),(h-32)/Math.max(bounds.height,1));
      const initialView=d3.zoomIdentity.translate(w/2,h/2).scale(scale).translate(-bounds.x-bounds.width/2,-bounds.y-bounds.height/2);
      svg.call(zoom.transform,initialView);
      node.call(d3.drag().clickDistance(6).touchable(true)
        .on('start',(event,n)=>{simulation.stop();n.fx=n.x;n.fy=n.y;n.dragOrigin={x:event.x,y:event.y};n.moved=false;})
        .on('drag',(event,n)=>{if(Math.hypot(event.x-n.dragOrigin.x,event.y-n.dragOrigin.y)>6)n.moved=true;n.fx=event.x;n.fy=event.y;n.x=event.x;n.y=event.y;tick();})
        .on('end',(event,n)=>{n.fx=null;n.fy=null;if(event.sourceEvent.type==='touchend'&&!n.moved)window.location.assign(n.url);}));
      box.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>svg.call(zoom.scaleBy,b.dataset.zoom==='in'?1.3:1/1.3));
      box.querySelector('[data-reset]').onclick=()=>{svg.call(zoom.transform,initialView);clearHover();populate();};
      observer?.disconnect();observer=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)simulation.stop();});observer.observe(canvas);
      box.dataset.motion=reduced?'reduced':'bounded';box.dataset.simulation='stopped';
    }
    async function load(){status.textContent='正在加载公开知识网络…';retry.hidden=true;simulation?.stop();observer?.disconnect();try{
      const response=await fetch(box.dataset.source);if(!response.ok)throw Error();data=await response.json();
      status.textContent=`${data.nodes.length} 篇笔记 · ${data.edges.length} 处引用`;populate();
      if(!data.nodes.length){canvas.hidden=true;status.textContent='还没有公开笔记，知识网络将在这里慢慢生长。';return;}
      if(data.nodes.length>500||data.edges.length>2000){canvas.hidden=true;status.textContent+='；数量超过图谱显示预算，请通过下方笔记列表阅读。';return;}
      canvas.hidden=false;render();if(box.dataset.center)choose(data.nodes.find(n=>n.id===box.dataset.center));box.dataset.loaded='true';
    }catch{canvas.replaceChildren();status.textContent='图谱暂时无法加载，正文与阅读链接仍可使用。';retry.hidden=false;}}
    retry.onclick=load;window.addEventListener('pagehide',()=>{simulation?.stop();observer?.disconnect();});load();
  });
})();
