import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const jsData=read('web/src/data.js');
const jsGame=read('web/src/main.js');

test('LDS Game source and question decks are intact',()=>{
  const sandbox={window:{}};
  runInNewContext(jsData,sandbox,{filename:'web/src/data.js'});
  const game=sandbox.window.LDS_GAME_DATA;
  assert.ok(game,'Expected the published question bank');
  assert.equal(game.board.length,32);
  assert.ok(game.cards.length>=60,'All LDS questions must remain available');
  const decks=new Set(game.cards.map(card=>card.deck));
  for(const id of ['station','variable','data-cleaning','exam-trap','challenge'])
    assert.ok(decks.has(id),'Missing LDS card deck '+id);
  assert.equal(game.board[0].label,'Met Office HQ');
  assert.ok(game.rules?.summary?.length>2);
  const images=game.board.map(space=>space.stationImage).filter(Boolean);
  assert.equal(images.length,8,'All weather station pictures must be represented');
  for(const filename of images){
    assert.match(filename,/^[A-Za-z0-9_-]+\.jpg$/i);
    const uri=new URL('../LDS_Board_game/images/'+filename,import.meta.url);
    assert.ok(existsSync(uri),'Missing station photograph '+filename);
    const bytes=readFileSync(uri);
    assert.ok(bytes.length>300,'Invalid station photograph '+filename);
    assert.ok(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff,'Not JPEG: '+filename);
  }
});

test('Both LDS JavaScript assets parse as scripts',()=>{
  assert.doesNotThrow(()=>new Script(jsData));
  assert.doesNotThrow(()=>new Script(jsGame));
});

test('Pages serves all assets with portable relative paths',()=>{
  assert.match(html,/^<!doctype html>/i);
  assert.match(html,/<title>Race Around the Large Data Set<\/title>/);
  assert.doesNotMatch(html,/This site is hosted on Netlify/);
  assert.equal(read('CNAME').trim(),'lds.mrwalkermaths.com');
  const paths=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)]
    .map(match=>match[1]).sort();
  assert.deepEqual(paths.sort(),['web/src/data.js','web/src/main.js','web/src/styles.css'].sort());
  for(const path of paths){
    for(const root of ['https://chriswalker-afk.github.io/ldsgame/','https://lds.mrwalkermaths.com/']){
      const absolute=new URL(path,root);
      assert.equal(absolute.origin,new URL(root).origin);
      assert.ok(absolute.pathname.startsWith(new URL(root).pathname));
    }
    assert.ok(existsSync(new URL('../'+path,import.meta.url)));
  }
  for(const id of ['board','rollButton','teamCount','startButton','scoreboard','reviewMode','cardPanel','rulesDialog'])
    assert.ok(html.includes('id="'+id+'"'),'Missing important game control: '+id);
  assert.doesNotMatch(html,/\/\.netlify\//);
});
