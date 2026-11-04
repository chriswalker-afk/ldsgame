import {createHash} from 'node:crypto';

const base='https://ldsgame.netlify.app/';
const response=await fetch(base,{
  redirect:'follow',headers:{'User-Agent':'LDS-Game-GitHub-Migration-Audit/1.0'},
  signal:AbortSignal.timeout(30000)
});
if(!response.ok)throw Error('Live Netlify site returned HTTP '+response.status);
const html=await response.text();
const sha=data=>createHash('sha256').update(data).digest('hex');
const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()??null;
const attrs=[...html.matchAll(/<(?:script|link|img|source|iframe|video|audio)\b[^>]*>/gi)]
  .flatMap(m=>{
    const tag=m[0];return [...tag.matchAll(/\b(?:src|href|poster)=["']([^"']+)["']/gi)].map(a=>({tag:tag.slice(0,45),url:a[1]}));
  });
const css=[...html.matchAll(/url\(\s*['"]?([^)'" ]+)['"]?\s*\)/gi)].map(m=>({tag:'inline-css-url',url:m[1]}));
const imports=[...html.matchAll(/\b(?:fetch|import)\s*\(\s*["']([^"']+)["']/gi)].map(m=>({tag:'literal-dynamic-import',url:m[1]}));
const all=[...attrs,...css,...imports];
const inside=all.filter(x=>{try{const u=new URL(x.url,base);return u.origin===new URL(base).origin&&!x.url.startsWith('#')&&!x.url.startsWith('data:')}catch{return false}});
console.log('LIVE_AUDIT='+JSON.stringify({
  status:response.status,finalUrl:response.url,title,bytes:Buffer.byteLength(html,'utf8'),sha256:sha(html),
  htmlStart:html.slice(0,1300),htmlEnd:html.slice(-1500),
  elements:all,internalAssets:[...new Set(inside.map(x=>new URL(x.url,base).pathname))],
  inlineScripts:[...html.matchAll(/<script\b(?![^>]*\bsrc=)/gi)].length,
  inlineStyles:[...html.matchAll(/<style\b/gi)].length,
  netlifyHUD:(html.match(/\/\.netlify\/scripts\/hud/g)||[]).length,
  netlifyFns:/\/\.netlify\/functions\//i.test(html),
  netlifyIdentity:/netlify-identity/i.test(html),
  netlifyForms:/data-netlify\s*=|<form\b[^>]*\bnetlify\b/i.test(html),
  browserStorage:/localStorage|indexedDB|sessionStorage/i.test(html),
  serviceWorker:/serviceWorker\.register/i.test(html)
}));
for(const path of [...new Set(inside.map(x=>new URL(x.url,base).pathname))]){
  if(path.startsWith('/.netlify/'))continue;
  const u=new URL(path,base);
  const r=await fetch(u,{signal:AbortSignal.timeout(25000)});
  const buffer=Buffer.from(await r.arrayBuffer());
  console.log('LIVE_ASSET='+JSON.stringify({
    path,status:r.status,mime:r.headers.get('content-type'),bytes:buffer.length,
    sha256:sha(buffer),start:buffer.toString('utf8',0,Math.min(250,buffer.length))
  }));
  if(!r.ok)throw Error('Required asset unavailable: '+u);
}
