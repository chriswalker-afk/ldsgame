import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const base='https://ldsgame.netlify.app/';
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const expected=new Map([
  ['index.html','a0dd9626e8b09637e572de11307ccbe5e269aaec7f96f421aa21096871fc729c'],
  ['web/src/styles.css','f794b9095b22c13216d22b74a8a39c4012d1f434421923e8954cc2e683a5ee96'],
  ['web/src/data.js','80a54647e5c64e22de8bdf5146f8b1bd650ef1c69c0c76d73ab062fec38f4f27'],
  ['web/src/main.js','5a5c223533e227fd7e33e4dba8ae54898fe87a3fc31a2edc5734d642ab21320c']
]);
const downloaded=new Map();
for(const [path,digest] of expected){
  const response=await fetch(new URL(path,base),{
    redirect:'follow',headers:{'User-Agent':'LDS-Game-GitHub-Migration/1.0'},
    signal:AbortSignal.timeout(30000)
  });
  if(response.status!==200)throw Error('Netlify '+path+' returned '+response.status);
  const buffer=Buffer.from(await response.arrayBuffer());
  if(sha(buffer)!==digest)throw Error('Live Netlify asset changed since audit; do not overwrite '+path);
  downloaded.set(path,buffer.toString('utf8'));
}
let html=downloaded.get('index.html');
const netlifyComment=/<!-- This site is hosted on Netlify\.[\s\S]*?Netlify hosting facts for this site: static\/SSR served via Netlify Edge\. -->[ \t]*\r?\n?/g;
const count=[...html.matchAll(netlifyComment)].length;
if(count!==1)throw Error('Expected exactly one Netlify hosting-only comment, got '+count);
html=html.replace(netlifyComment,'');
if(!html.startsWith('<!doctype html>')||!html.includes('<title>Race Around the Large Data Set</title>')){
  throw Error('Wrong imported HTML application');
}
downloaded.set('index.html',html);
const resources=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)].map(x=>x[1]);
if(JSON.stringify(resources.sort())!==JSON.stringify(['web/src/data.js','web/src/main.js','web/src/styles.css'].sort()))
  throw Error('Unexpected extra HTML resources: '+JSON.stringify(resources));
const css=downloaded.get('web/src/styles.css');
const cssUrls=[...css.matchAll(/url\(\s*["']?([^)'" ]+)["']?\s*\)/gi)].map(x=>x[1]).filter(x=>!x.startsWith('data:')&&!x.startsWith('#'));
if(cssUrls.length)throw Error('Unexpected external CSS assets require manual audit: '+JSON.stringify(cssUrls));
const scripts=downloaded.get('web/src/main.js')+'\n'+downloaded.get('web/src/data.js');
const dynamicFetch=[...scripts.matchAll(/\b(?:fetch|import)\s*\(\s*["'\x60]([^"'\x60]+)["'\x60]/g)].map(x=>x[1]);
if(dynamicFetch.length)throw Error('Unexpected script-imported assets require audit: '+JSON.stringify(dynamicFetch));
for(const [path,contents] of downloaded){
  mkdirSync(path.split('/').slice(0,-1).join('/')||'.',{recursive:true});
  writeFileSync(path,contents,'utf8');
  console.log('IMPORTED_FILE='+JSON.stringify({path,bytes:Buffer.byteLength(contents),sha256:sha(Buffer.from(contents))}));
}
console.log('IMPORT_RESULT='+JSON.stringify({files:downloaded.size,source:base,
  removedNetlifyComment:true,cssAssetReferences:cssUrls.length,dynamicScriptFetches:dynamicFetch.length,
  title:'Race Around the Large Data Set',status:'PASS'}));
