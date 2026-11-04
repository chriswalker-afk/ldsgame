import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const custom='https://lds.mrwalkermaths.com/';
const original='https://ldsgame.netlify.app/';
const oldGithub='https://chriswalker-afk.github.io/ldsgame/';
const paths=[
  'index.html','web/src/styles.css','web/src/data.js','web/src/main.js',
  'LDS_Board_game/images/camborne.jpg','LDS_Board_game/images/Heathrow.jpg',
  'LDS_Board_game/images/hurn.jpg','LDS_Board_game/images/Leeming.jpg',
  'LDS_Board_game/images/Leuchars.jpg','LDS_Board_game/images/Beijing.jpg',
  'LDS_Board_game/images/Jacksonville.jpg','LDS_Board_game/images/Perth.jpg'
];
const sha=body=>createHash('sha256').update(body).digest('hex');
const netlifyComment=/<!-- This site is hosted on Netlify\.[\s\S]*?Netlify hosting facts for this site: static\/SSR served via Netlify Edge\. -->[ \t]*\r?\n?/g;
const fetchPage=async url=>{
  const response=await fetch(url,{redirect:'follow',
    signal:AbortSignal.timeout(30000),headers:{'User-Agent':'LDS-Game-CustomDomainVerification/1.0'}});
  const body=Buffer.from(await response.arrayBuffer());
  return {response,body};
};
let checked=0;
for(const path of paths){
  const local=readFileSync(new URL('../'+path,import.meta.url));
  const {response,body}=await fetchPage(new URL(path,custom));
  const actual=new URL(response.url);
  const same=local.equals(body);
  const record={path,status:response.status,bytes:body.length,
    contentType:response.headers.get('content-type'),
    sourceMatch:same,sha256:sha(body)};
  console.log('LIVE_ASSET='+JSON.stringify(record));
  if(response.status!==200||actual.origin!==new URL(custom).origin||!same)
    throw Error('Live custom domain did not match source: '+JSON.stringify({...record,url:response.url}));
  checked++;
}
const {response:net,body:netRaw}=await fetchPage(original);
if(net.status!==200)throw Error('Original Netlify site not accessible');
const normalized=Buffer.from(netRaw.toString('utf8').replace(netlifyComment,''),'utf8');
const sourceHTML=readFileSync(new URL('../index.html',import.meta.url));
if(!normalized.equals(sourceHTML))throw Error('Netlify HTML differs from the imported application');
const {response:legacy}=await fetchPage(oldGithub);
const legacyRedirected=legacy.status===200&&new URL(legacy.url).origin===new URL(custom).origin;
console.log('LIVE_DOMAIN_RESULT='+JSON.stringify({
  newAddress:custom,https:true,
  assetsChecked:checked,allFilesMatchRepo:true,photosChecked:8,
  originalNetlify:{status:net.status,equivalentApp:true},
  oldGitHub:{status:legacy.status,finalUrl:legacy.url,redirectedToNewDomain:legacyRedirected},
  status:'PASS'
}));
if(legacy.status!==200)throw Error('Existing GitHub Pages project address is unavailable');
