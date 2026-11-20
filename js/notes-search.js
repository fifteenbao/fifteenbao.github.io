(() => {
  const box=document.querySelector('[data-notes-search]'); if(!box)return;
  const input=box.querySelector('input'),status=box.querySelector('[role=status]'),list=box.querySelector('ul');
  let index,loading,timer,sequence=0;
  const normalize=s=>String(s).normalize('NFC').toLowerCase().trim();
  async function search(){
    const seq=++sequence,query=normalize(input.value); list.replaceChildren();
    if(!query){status.textContent='输入关键词搜索，或浏览下方全部笔记。';return;}
    status.textContent='正在搜索…';
    try{
      loading??=fetch('/notes/search.json').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{loading=null;throw e;});index??=await loading;if(seq!==sequence)return;
      const terms=query.split(/\s+/),matches=index.filter(n=>terms.every(t=>normalize([n.title,...n.link_aliases,...n.keywords,n.text].join(' ')).includes(t)));
      const rank=n=>terms.every(t=>normalize(n.title).includes(t))?0:terms.every(t=>normalize(n.link_aliases.join(' ')).includes(t))?1:2;
      matches.sort((a,b)=>rank(a)-rank(b)||b.lastmod.localeCompare(a.lastmod)||a.id.localeCompare(b.id));
      status.textContent=matches.length?`${matches.length} 篇公开笔记`:'没有找到相关笔记，试试另一个关键词。';
      for(const n of matches){const li=document.createElement('li'),a=document.createElement('a');a.href=n.url;a.textContent=n.title;li.append(a);list.append(li);}
    }catch{if(seq===sequence)status.textContent='搜索暂时不可用，请浏览下方全部笔记，或重新输入重试。';}
  }
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,150);});
})();
