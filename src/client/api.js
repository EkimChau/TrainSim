export async function api(route,{method='GET',body,query}={}){
  const qs=query?'?'+new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined&&v!==null&&v!=='')):'';
  const res=await fetch('/api'+route+qs,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
  if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}

export const el=(tag,attrs={},...children)=>{
  const node=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(v===undefined||v===null||v===false)continue;
    if(k==='class')node.className=v;
    else if(k.startsWith('on'))node.addEventListener(k.slice(2),v);
    else if(k==='text')node.textContent=v;
    else node.setAttribute(k,v===true?'':v);
  }
  for(const c of children.flat())if(c!==null&&c!==undefined&&c!==false)node.append(c instanceof Node?c:document.createTextNode(String(c)));
  return node;
};

export const store={
  get(k,d){try{const v=localStorage.getItem('trainsim:'+k);return v===null?d:JSON.parse(v);}catch{return d;}},
  set(k,v){try{localStorage.setItem('trainsim:'+k,JSON.stringify(v));}catch{/* storage unavailable */}},
};

export function toast(message,kind='info'){
  const host=document.getElementById('toasts');
  const t=el('div',{class:`toast toast-${kind}`,role:'status'},message);
  host.append(t);
  setTimeout(()=>t.remove(),kind==='error'?7000:3500);
}

export const fmt=n=>n==null?'—':Number(n).toLocaleString();
