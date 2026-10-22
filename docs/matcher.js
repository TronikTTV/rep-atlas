/* REP ATLAS matcher v3. Conservative grouping using model codes, strong titles and
   photo fingerprints. Seller offers keep their own title, price, URL and gallery. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RepMatcher=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const stop=new Set(('husky taurus reps seller shop yupoo photo model size sizes sizing fit im iwear wearing height weight 180cm 185cm 170cm 175cm xxl xxxl xxlarge xs 68kg 90kg 80kg one new hot sale best 2023 2024 2025 2026 100 top pants topwear photos premium brand clothing fashion original').split(' '));
const colours=['black grey pink','grey pink','navy blue','light grey','dark grey','off white','olive green','baby blue','black','white','grey','gray','navy','blue','pink','red','green','yellow','orange','purple','brown','beige','cream','olive','khaki','silver','gold'];
const typeOptions=[
 ['caps','Caps & hats',/\b(?:caps?|hats?|beanies?|bucket hats?|trucker caps?|balaclavas?)\b/],
 ['tshirts','T-shirts & jerseys',/\b(?:t shirts?|tshirts?|tees?|jerseys?)\b/],
 ['hoodies','Hoodies',/\b(?:hoodies?|hooded)\b/],
 ['sweatshirts','Sweatshirts',/\b(?:sweatshirts?|crewnecks?)\b/],
 ['shirts','Shirts & polos',/\b(?:shirts?|polos?|overshirts?|button up|dress shirts?)\b/],
 ['knitwear','Jumpers & knitwear',/\b(?:sweaters?|jumpers?|knitwear|knits?|cardigans?|pullovers?)\b/],
 ['jackets','Jackets & coats',/\b(?:jackets?|coats?|nuptse|puffers?|parkas?|gilets?|bombers?|windbreakers?|anoraks?)\b/],
 ['pants','Pants & trousers',/\b(?:pants|trousers|joggers?|jeans|denim|cargos?|sweatpants|leggings|tracksuit bottoms?)\b/],
 ['shorts','Shorts',/\bshorts?\b/],
 ['tracksuits','Tracksuits',/\b(?:tracksuits?|track suits?)\b/],
 ['sets','Matching sets',/\b(?:sets?|two piece|2 piece)\b/],
 ['suits','Suits & blazers',/\b(?:suits?|blazers?)\b/],
 ['shoes','Shoes',/\b(?:shoes?|sneakers?|trainers?|boots?|loafers?|sandals?|slides?|sliders?|slippers?|air max|air force|dunks?|jordans?|air jordan|yeezy)\b/],
 ['bags','Bags',/\b(?:bags?|backpacks?|rucksacks?|handbags?|totes?|crossbody|pouches?|holdalls?)\b/],
 ['underwear','Underwear',/\b(?:underwear|boxers?|briefs?)\b/],
 ['socks','Socks',/\bsocks?\b/],
 ['dresses','Dresses & skirts',/\b(?:dresses?|skirts?)\b/],
 ['swimwear','Swimwear',/\b(?:swimwear|swimsuits?|swim shorts?|bikinis?)\b/],
 ['accessories','Accessories',/\b(?:belts?|wallets?|scarves?|gloves?|sunglasses|glasses|bracelets?|necklaces?|rings?|watches?|ties|keychains?|phone cases?)\b/]
];
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[🔥⭐★✴️]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
function brandOf(o){const brand=norm(o.brand);return ['other','unknown','husky 1 1','1 1','taurus',''].includes(brand)?'':brand}
function core(o){
 let text=norm(o.title).replace(/\b(?:yuan|rmb)\b/g,' ');
 text=text.replace(/\b(?:\d{2,4})\s*(?:cm|kg)\b/g,' ');
 text=text.replace(/\b(?:\d{5,11})\b/g,' ');
 for(const c of colours)text=text.replace(new RegExp('(?:^| )'+c+'(?= |$)','g'),' ');
 return text.replace(/\b(?:\d{2,5})\b/g,' ').replace(/\s+/g,' ').trim();
}
function kinds(o){const s=norm(o.title),shirtText=s.replace(/\b(?:t shirts?|tshirts?)\b/g,' ');const found=[];for(const [id,,re] of typeOptions){if(id==='shirts'?re.test(shirtText):re.test(s))found.push(id)}return found.length?found:['other']}
function kind(o){return kinds(o)[0]}
function typeLabel(id){return id==='other'?'Other':(typeOptions.find(x=>x[0]===id)||[])[1]||id}
function canonicalBrand(value,aliases={}){
 const standardise=name=>{const label=String(name||'Other').trim()||'Other',compact=norm(label).replace(/\s+/g,'');if(compact==='cp'||compact==='cpcompany')return 'C.P. Company';if(compact==='prada'||compact==='paa'&&/[🔥⭐★]/.test(label))return 'Prada';return label};
 let current=standardise(value);const seen=new Set();
 for(let i=0;i<10;i++){const key=Object.keys(aliases||{}).find(from=>norm(from)===norm(current));if(!key||seen.has(norm(key)))break;seen.add(norm(key));const next=standardise(aliases[key]);if(!next||next===current)break;current=next}
 return current;
}
function codes(o){const text=String(o.title||'').toUpperCase().replace(/[🔥⭐]/g,'');
 const found=[...text.matchAll(/\b([A-Z]{1,5}\d{3,6})(?:[-\s](\d{2,4}))?\b/g)].map(m=>m[1]);
 return [...new Set(found)].filter(x=>x.length<9&&!/^(?:CM|KG|SKU)\d+/.test(x));
}
function words(o){const b=new Set(brandOf(o).split(' '));return [...new Set(core(o).split(' ').filter(x=>x.length>=3&&!stop.has(x)&&!b.has(x)))].sort()}
function overlap(a,b){const x=new Set(a),y=new Set(b),common=[...x].filter(w=>y.has(w)).length;return common/Math.max(x.size,y.size,1)}
function sameBrand(a,b){return brandOf(a)!==''&&brandOf(a)===brandOf(b)}
function similarity(a,b){
 if(!sameBrand(a,b))return 0;
 let wa=words(a),wb=words(b);
 if(kind(a)!=='other'&&kind(b)!=='other'&&kind(a)!==kind(b))return 0;
 const shared=wa.filter(w=>wb.includes(w)).length;
 if(shared<2)return 0;
 return overlap(wa,wb);
}
const bitCount=[0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];
function hashSimilarity(a,b){
 a=String(a||'');b=String(b||'');if(!a||a.length!==b.length)return 0;
 let different=0;for(let i=0;i<a.length;i++){const x=parseInt(a[i],16),y=parseInt(b[i],16);if(!Number.isFinite(x)||!Number.isFinite(y))return 0;different+=bitCount[x^y]}
 return 1-different/(a.length*4);
}
function visualSimilarity(a,b){
 const x=String(a?.visual_hash||'').split(':'),y=String(b?.visual_hash||'').split(':');
 if(x.length!==3||y.length!==3||x[0]!=='v1'||y[0]!=='v1')return {average:0,shape:0,detail:0};
 const shape=hashSimilarity(x[1],y[1]),detail=hashSimilarity(x[2],y[2]);
 return {shape,detail,average:(shape+detail)/2};
}
function matchingVisual(a,b){
 if(!sameBrand(a,b)||String(a.seller||'').toLowerCase()===String(b.seller||'').toLowerCase())return false;
 const ka=kind(a),kb=kind(b),pa=Number(a.price_yuan),pb=Number(b.price_yuan);
 if(ka==='other'||ka!==kb||!Number.isFinite(pa)||!Number.isFinite(pb)||Math.max(pa,pb)/Math.max(1,Math.min(pa,pb))>1.2)return false;
 const shared=words(a).filter(word=>words(b).includes(word));if(!shared.length)return false;
 const score=visualSimilarity(a,b),samePrice=Math.round(pa)===Math.round(pb);return samePrice?score.shape>=.89&&score.detail>=.74:score.shape>=.94&&score.detail>=.82;
}
function exactKey(o){
 if(o.preserve_listing)return 'listing:'+o.id;
 const brand=brandOf({brand:o.brand_key||o.brand}),k=kind(o),c=codes(o);
 if(brand&&c.length)return 'style:'+brand+':'+c[0]+':'+(k==='other'?'item':k);
 const w=words(o);
 if(brand&&k!=='other'&&w.length>=4)return 'title:'+brand+':'+k+':'+w.join('-');
 return 'listing:'+o.id;
}
function group(offers,edits={}){
 // An album may have been uploaded via cloud and in-app imports; use its ID once.
 const map=new Map();
 for(const o of offers||[])if(o&&o.id)map.set(o.id,map.has(o.id)?{...map.get(o.id),...o}:o);
 const data=[...map.values()];
 const groups=new Map();
 for(const o of data){const key=edits[o.id]||exactKey(o);if(!groups.has(key))groups.set(key,{key,offers:[]});groups.get(key).offers.push(o)}
 // Merge high-confidence near-identical descriptions from different sellers.
 const arr=[...groups.values()],parent=arr.map((_,i)=>i);
 const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 const unite=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
 // Strong title matches stay supported for smaller catalogues.
 if(arr.length<=3000)for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
  const a=arr[i],b=arr[j];
  if(a.offers.some(x=>b.offers.some(y=>!x.preserve_listing&&!y.preserve_listing&&x.seller!==y.seller&&similarity(x,y)>=.96&&words(x).length>=5&&words(y).length>=5)))unite(i,j);
 }
 // Photo matching is bucketed by brand, clothing type and exact price, so it stays
 // fast even with thousands of listings and does not compare unrelated products.
 const visualBuckets=new Map();
 for(let i=0;i<arr.length;i++)for(const offer of arr[i].offers){
  const brand=brandOf(offer),productKind=kind(offer),price=Number(offer.price_yuan);
  if(!brand||productKind==='other'||!offer.visual_hash||!Number.isFinite(price))continue;
  const base=brand+'|'+productKind,band=Math.floor(price/25);if(!visualBuckets.has(base))visualBuckets.set(base,new Map());const bands=visualBuckets.get(base);if(!bands.has(band))bands.set(band,[]);bands.get(band).push({i,offer});
 }
 for(const bands of visualBuckets.values())for(const [band,bucket] of bands){const nearby=[...bucket,...(bands.get(band+1)||[])];for(let a=0;a<bucket.length;a++)for(let b=a+1;b<nearby.length;b++)if(bucket[a].i!==nearby[b].i&&matchingVisual(bucket[a].offer,nearby[b].offer))unite(bucket[a].i,nearby[b].i)}
 const combined=new Map();
 for(let i=0;i<arr.length;i++){const root=find(i),source=arr[i];if(!combined.has(root))combined.set(root,{key:arr[root].key,offers:[],memberKeys:[]});const target=combined.get(root);target.offers.push(...source.offers);target.memberKeys.push(source.key,...(source.memberKeys||[]))}
 return [...combined.values()].map(g=>{
  g.memberKeys=[...new Set([g.key,...g.memberKeys])];
  g.offers.sort((a,b)=>(a.price_yuan==null?Infinity:Number(a.price_yuan))-(b.price_yuan==null?Infinity:Number(b.price_yuan)));
  const best=g.offers.find(o=>o.image||(o.images||[]).length)||g.offers[0];
  g.hero=best;g.brand=best.brand||'Other';g.title=best.title||'Untitled album';
  g.sellers=[...new Set(g.offers.map(o=>o.seller))];
  g.colors=[...new Set(g.offers.map(o=>(o.color||'Unknown').trim()))];
  g.types=[...new Set(g.offers.flatMap(kinds))];
  return g;
 }).sort((a,b)=>a.title.localeCompare(b.title));
}
function possibleMatches(selected,groups){
 if(!selected||selected.sellers.length>1)return [];
 const selectedBrand=norm(selected.brand),selectedKind=kind(selected.hero);
 const cand=groups.filter(g=>g!==selected&&norm(g.brand)===selectedBrand&&kind(g.hero)===selectedKind&&g.sellers.some(s=>!selected.sellers.includes(s)))
   .map(g=>({group:g,score:Math.max(...selected.offers.flatMap(a=>g.offers.map(b=>Math.max(similarity(a,b),visualSimilarity(a,b).average))))}))
   .filter(x=>x.score>=.45||Number(x.group.hero.price_yuan)===Number(selected.hero.price_yuan)).sort((a,b)=>b.score-a.score).slice(0,8);
 return cand;
}
function mixBySeller(items){
 const buckets=new Map();
 for(const item of items||[]){
  const sellers=(item.sellers||[]).map(s=>String(s).toLowerCase());
  const key=sellers.includes('husky')&&sellers.includes('taurus')?'Both':sellers.includes('husky')?'Husky':sellers.includes('taurus')?'Taurus':String((item.sellers||[])[0]||'Other');
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(item);
 }
 const preferred=['Husky','Taurus','Both'],order=[...preferred,...[...buckets.keys()].filter(key=>!preferred.includes(key))].filter(key=>buckets.has(key));
 const mixed=[];let found=true;
 while(found){found=false;for(const key of order){const item=buckets.get(key).shift();if(item){mixed.push(item);found=true}}}
 return mixed;
}
return {group,exactKey,kind,kinds,typeLabel,typeOptions:typeOptions.map(([id,label])=>({id,label})),codes,similarity,visualSimilarity,possibleMatches,mixBySeller,canonicalBrand};
});
