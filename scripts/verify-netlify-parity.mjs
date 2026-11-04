import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const base='https://ldsgame.netlify.app/';
const files=[
  'index.html','web/src/styles.css','web/src/data.js','web/src/main.js',
  'LDS_Board_game/images/camborne.jpg','LDS_Board_game/images/Heathrow.jpg',
  'LDS_Board_game/images/hurn.jpg','LDS_Board_game/images/Leeming.jpg',
  'LDS_Board_game/images/Leuchars.jpg','LDS_Board_game/images/Beijing.jpg',
  'LDS_Board_game/images/Jacksonville.jpg','LDS_Board_game/images/Perth.jpg'
];
const stripNetlify=/<!-- This site is hosted on Netlify\.[\s\S]*?Netlify hosting facts for this site: static\/SSR served via Netlify Edge\. -->[ \t]*\r?\n?/g;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let equivalent=0;
for(const path of files){
  const response=await fetch(new URL(path,base),{
    redirect:'follow',signal:AbortSignal.timeout(30000),
    headers:{'User-Agent':'LDS-Game-SourceParity/1.0'}
  });
  if(response.status!==200)throw Error('Live Netlify resource unavailable: '+path);
  let actual=Buffer.from(await response.arrayBuffer());
  if(path==='index.html'){
    const original=actual.toString('utf8');
    if([...original.matchAll(stripNetlify)].length!==1)
      throw Error('Unexpected hosting-only Netlify markup in live page');
    actual=Buffer.from(original.replace(stripNetlify,''),'utf8');
  }
  const expected=readFileSync(new URL('../'+path,import.meta.url));
  const matches=actual.equals(expected);
  console.log('PARITY_ASSET='+JSON.stringify({path,status:response.status,
    netlifyBytes:actual.length,githubBytes:expected.length,
    netlifySHA256:sha(actual),githubSHA256:sha(expected),identical:matches}));
  if(!matches)throw Error('Imported file differs from live Netlify after normalization: '+path);
  equivalent++;
}
console.log('PARITY_RESULT='+JSON.stringify({source:base,files:equivalent,
  normalizedNetlifyAppMatchesGitHub:true,all8WeatherStationPhotographs:true,
  removedNetlifyHostingComment:true,status:'PASS'}));
