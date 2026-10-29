import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backgroundThemes,themeArtwork} from '../src/backgroundCatalog.ts';
test('backgrounds use bounded local doodle tiles without external assets or expensive SVG effects',()=>{
 const patterns=new Set();
 for(const theme of backgroundThemes.filter(theme=>theme.id!=='classic')){
  for(const palette of [theme.light,theme.dark]){
   const url=themeArtwork(theme,palette[2]);assert(url.length<8000,'Small encoded tile');
   const svg=decodeURIComponent(url.slice(url.indexOf(',')+1,-2));assert(svg.includes('viewBox="0 0 192 192"'));assert(!svg.includes('@a@'));
   assert(!/<(?:filter|image|animate|feGaussianBlur|script)\b/.test(svg));
   assert([...svg.matchAll(/href="([^"]+)"/g)].every(match=>match[1].startsWith('#')));
   assert.equal(themeArtwork(theme,palette[2]),url);
  }
  patterns.add(theme.art);
 }
 assert.equal(patterns.size,8);assert.equal(themeArtwork(backgroundThemes[0],'#000000'),'none');
});
