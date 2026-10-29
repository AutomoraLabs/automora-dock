export type BackgroundTheme={id:string;name:string;group:'Classic'|'Soft'|'Bold';light:[string,string,string,string];dark:[string,string,string,string];art:string};
// Small rounded motifs, not full-window artwork. Each cached tile is reused.
const motifs:Record<string,string>={
 star:'<path d="M0-7C1-7 2-3 3-3C4-3 8-3 8-1C8 0 5 2 5 3C5 5 7 8 5 8C3 8 1 5 0 5C-1 5-4 8-5 7C-6 6-4 3-5 2C-6 1-9-1-7-2C-6-3-3-2-2-3C-1-4-1-7 0-7Z"/>',
 heart:'<path d="M0 6C-12-1-7-10 0-4C7-11 13-2 0 6Z"/>',
 cloud:'<path d="M-9 4C-15 2-12-5-7-4C-8-12 4-13 6-6C15-9 17 3 10 5Q0 8-9 4Z"/>',
 bow:'<path d="M-1 0C-14-12-15 10-2 3L-5 10Q-3 10 0 4Q3 10 5 10L2 3C15 10 14-12 1 0Z"/>',
 clover:'<path d="M0 1C-13 3-12-9-4-5C-9-16 7-16 4-5C13-10 16 4 3 3Q5 8 2 11Q3 6 0 1Z"/>',
 moon:'<path d="M4-8C-10-9-14 8-1 10Q8 11 10 4C1 8-4-3 4-8Z"/>',
 planet:'<ellipse rx="6" ry="5"/><path d="M-9 4Q-14 0-4-3M4 3Q14 0 9-4" fill="none" stroke="@a@" stroke-width="1.2" stroke-linecap="round"/>',
 bubble:'<circle r="5"/><circle cx="7" cy="-6" r="2"/><circle cx="-7" cy="6" r="1.5"/>',
 shell:'<path d="M-8 3C-13-7 1-13 8-4Q12 1 5 6L-3 7Z"/><path d="M-3 5L-6-1M0 5L0-4M3 4L5-1" fill="none" stroke="@a@" stroke-width=".7" stroke-linecap="round" opacity=".4"/>',
 sprout:'<path d="M0 8Q1 1 0-4M0 1Q-12 2-8-6Q-1-8 0 1ZM1-1Q1-10 9-8Q12-2 1-1Z"/>',
};
function doodles(types:string[]){
 const positions=[[18,22,.65,-12],[76,12,.5,15],[140,32,.65,8],[40,66,.55,15],[102,79,.7,-10],[175,68,.5,-18],[16,118,.5,5],[67,128,.7,-12],[136,118,.55,16],[42,176,.65,10],[110,173,.5,-14],[177,172,.65,12]];
 return `<defs>${[...new Set(types)].map(name=>`<g id="${name}">${motifs[name]}</g>`).join('')}</defs>`+positions.map(([x,y,scale,angle],i)=>`<use href="#${types[i%types.length]}" transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})" fill="@${i%5===0?'b':i%7===0?'c':'a'}@" opacity="${i%4===0?'.18':'.12'}"/>`).join('')+'<g fill="@a@" opacity=".08"><circle cx="52" cy="33" r="1.1"/><circle cx="152" cy="154" r="1.2"/><circle cx="84" cy="103" r="1"/></g>';
}
export const backgroundThemes:BackgroundTheme[]=[
 {id:'classic',name:'Classic',group:'Classic',light:['#f7f8fa','#242936','#7055cb','#ffffff'],dark:['#101316','#e9edf1','#a99af8','#171b1f'],art:''},
 {id:'blush',name:'Blush Bloom',group:'Soft',light:['#fff4f6','#372731','#a54b72','#fffafb'],dark:['#241a22','#f8e9f2','#e7a5c3','#2e222c'],art:doodles(['star','star','heart'])},
 {id:'lavender',name:'Lavender Mist',group:'Soft',light:['#f4f0fc','#30283e','#7960a5','#fcfaff'],dark:['#211c30','#f0eafb','#baa5e3','#2b243e'],art:doodles(['cloud','star','heart'])},
 {id:'peach',name:'Peach Satin',group:'Soft',light:['#fff3eb','#3c2b26','#a86549','#fffbf7'],dark:['#2b211e','#fbede5','#e8b398','#352923'],art:doodles(['bow','heart','star'])},
 {id:'pearl',name:'Pearl Garden',group:'Soft',light:['#f8f7ee','#30372e','#657955','#fffffa'],dark:['#20251f','#eff2e6','#b0c59c','#2a3027'],art:doodles(['clover','star','heart'])},
 {id:'midnight',name:'Midnight Blue',group:'Bold',light:['#eef3fc','#21334f','#43689f','#f9fbff'],dark:['#111d31','#e7efff','#8eb5f1','#182840'],art:doodles(['star','moon','cloud'])},
 {id:'graphite',name:'Graphite',group:'Bold',light:['#eef0f2','#28303a','#566677','#fafbfc'],dark:['#171c23','#edf1f7','#a3b4c9','#222932'],art:doodles(['planet','star','cloud'])},
 {id:'ocean',name:'Ocean Depth',group:'Bold',light:['#eef8f8','#203c42','#357d88','#f8fdfd'],dark:['#10272d','#e4f5f5','#86c7d2','#19343c'],art:doodles(['bubble','shell','star'])},
 {id:'forest',name:'Forest Haze',group:'Bold',light:['#eff5ef','#293c31','#4a795c','#f9fcf8'],dark:['#14251e','#e8f4e8','#96c4a5','#1e3329'],art:doodles(['sprout','clover','star'])},
];
function lighten(color:string,amount:number){return '#'+color.slice(1).match(/../g)!.map(value=>Math.round(parseInt(value,16)*(1-amount)+255*amount).toString(16).padStart(2,'0')).join('');}
const artworkCache=new Map<string,string>();
export function themeArtwork(theme:BackgroundTheme,color:string){
 if(!theme.art)return 'none';
 const key=theme.id+color;const cached=artworkCache.get(key);if(cached)return cached;
 const art=theme.art.replaceAll('@a@',color).replaceAll('@b@',lighten(color,.45)).replaceAll('@c@','#dccb87');
 const image=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><g stroke-linecap="round" stroke-linejoin="round">${art}</g></svg>`)}")`;
 artworkCache.set(key,image);return image;
}
