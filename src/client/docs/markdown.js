import {el} from '../api.js';

export const docHref=(id,anchor='')=>`#/docs?doc=${encodeURIComponent(id)}${anchor?`&section=${encodeURIComponent(anchor)}`:''}`;
export const readmeHref=docHref;
export function documentLinks(simulation,repository){
  return new Map([...simulation.map(d=>[d.id,docHref(d.id)]),...repository.map(d=>[d.id,readmeHref(d.id)])]);
}

function localLink(id,anchor,known){
  const base=known instanceof Map?known.get(id):known.has(id)?docHref(id):null;
  return base?{href:base+(anchor?`&section=${encodeURIComponent(anchor)}`:'')}:null;
}

function link(href,source,known){
  if(/^https?:\/\//i.test(href))return {href,target:'_blank',rel:'noopener noreferrer'};
  if(href.startsWith('#'))return localLink(source,href.slice(1),known);
  try{
    const url=new URL(href,`https://docs.local/${source}`);
    const id=decodeURIComponent(url.pathname.slice(1));
    if(url.origin==='https://docs.local')return localLink(id,url.hash.slice(1),known);
  }catch{/* Invalid links are rendered as text. */}
  return null;
}

function inline(text,source,known){
  const parts=[],pattern=/`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*/g;
  let start=0;
  for(const match of text.matchAll(pattern)){
    parts.push(text.slice(start,match.index));
    if(match[1])parts.push(el('code',{},match[1]));
    else if(match[2]){const attrs=link(match[3],source,known);parts.push(attrs?el('a',attrs,match[2]):match[2]);}
    else parts.push(el('strong',{},match[4]));
    start=match.index+match[0].length;
  }
  parts.push(text.slice(start));return parts;
}

// Small Markdown renderer using DOM text nodes; source HTML is never interpreted.
export function renderMarkdown(content,source,known){
  const host=el('div',{class:'docs-markdown'}),lines=content.split('\n');
  const slug=s=>s.toLowerCase().replace(/[^\w\s-]/g,'').replace(/\s/g,'-');
  for(let i=0;i<lines.length;){
    const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(/^```/.test(line)){
      const code=[];i++;
      while(i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i++]);
      i++;host.append(el('pre',{},el('code',{},code.join('\n'))));continue;
    }
    const heading=/^(#{1,6})\s+(.+)$/.exec(line);
    if(heading){host.append(el(`h${heading[1].length}`,{id:slug(heading[2])},...inline(heading[2],source,known)));i++;continue;}
    if(line.includes('|')&&/^\s*\|?\s*:?-+/.test(lines[i+1]??'')){
      const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
      const table=el('table',{},el('thead',{},el('tr',{},...cells(line).map(c=>el('th',{},...inline(c,source,known))))));
      const body=el('tbody');i+=2;
      while(i<lines.length&&lines[i].includes('|'))body.append(el('tr',{},...cells(lines[i++]).map(c=>el('td',{},...inline(c,source,known)))));
      table.append(body);host.append(el('div',{class:'docs-table'},table));continue;
    }
    if(/^\s*(?:[-*]|\d+\.)\s+/.test(line)){
      const ordered=/^\s*\d+\./.test(line),list=el(ordered?'ol':'ul');
      while(i<lines.length&&/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])){
        let item=lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/,'');
        while(i<lines.length&&/^\s+\S/.test(lines[i]))item+=' '+lines[i++].trim();
        list.append(el('li',{},...inline(item,source,known)));
      }
      host.append(list);continue;
    }
    const paragraph=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!/^(?:#|```|\s*[-*] |\s*\d+\. )/.test(lines[i]))paragraph.push(lines[i++]);
    host.append(el('p',{},...inline(paragraph.join(' '),source,known)));
  }
  return host;
}
