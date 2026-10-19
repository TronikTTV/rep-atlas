#!/usr/bin/env python3
"""REP ATLAS public Yupoo importer.
Only fetches publicly available pages. No login/captcha bypass or proxies.
Runs in GitHub Actions and merges new data with previous JSON.
"""
import argparse
import hashlib
import mimetypes
import os
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qsl, urlencode, urlunparse

import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).parent
DEST=ROOT/'docs'/'data'/'catalogue.json'
SELLERS={'Husky':'https://huskyreps.x.yupoo.com','Taurus':'https://deateath.x.yupoo.com'}
HEADERS={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36','Accept-Language':'en-GB,en;q=0.9'}
COLORS=('black grey pink','grey pink','dark grey','light grey','navy blue','baby blue','off white','olive green','black','white','grey','gray','pink','red','blue','green','yellow','orange','purple','brown','beige','cream','navy','khaki','olive','silver','gold')
ALIASES={
 'Stone Island':['stone island','s i d','s id','sland','stn island'],
 'Nike':['nike','n k','nk','nke'],
 'Moncler':['moncler','m r','m c r','mnlr'],
 'Essentials':['essentials','fear of god','fog'],
 'Prada':['prada','p r a','pdra','prdra'],
 'Ralph Lauren':['ralph lauren','rapha u en','raphauen','ralphlauren','polo ralph lauren'],
 'The North Face':['the north face','north face','t n f','tnf'],
 'Arc’teryx':['arcteryx','arc teryx','arc’teryx'],
 'Palace':['palace','palae','plae'],
 'Corteiz':['corteiz','crt z','ctz'],
 'Bape':['bape','a bathing ape'],
 'CP Company':['cp company','c p company'],
 'Louis Vuitton':['louis vuitton','l v','lv'],
 'Canada Goose':['canada goose'],
 'Stussy':['stussy','st s y'],
 'Burberry':['burberry'],
 'Supreme':['supreme'],
 'Adidas':['adidas'],
 'Carhartt':['carhartt'],
 'Trapstar':['trapstar'],
 'Amiri':['amiri'],
 'Monterrain':['monterrain'],
 'Montirex':['montirex'],
 'Berghaus':['berghaus']
}
ALBUM_RX=re.compile(r'/albums/(\d+)')
CATEGORY_RX=re.compile(r'/categories/(\d+)')
PRICE_RX=re.compile(r'(?:[¥￥]\s*[~≈：:=]?\s*([0-9]+(?:\.[0-9]+)?)|\b([0-9]+(?:\.[0-9]+)?)\s*(?:rmb|yuan)\b)',re.I)
LINKED_RX=re.compile(r'https?://[\w-]+\.x\.yupoo\.com(?:/[^\s"<>]+)?',re.I)
TYPES=('tracksuit','hoodie','t shirt','tee','polo','cardigan','fleece','gilet','jeans','joggers','trousers','pants','shorts','sweater','jacket','coat','vest','shirt','cap','hat','socks','bag','belt','trainers','shoes')
STOP={'new','hot','sale','original','quality','premium','style','fashion','latest','2024','2025','2026','summer','winter','spring','autumn','version','batch','size','sizes','photo','men','women','unisex','wear','cm','kg','with','for','and','in','the','yuan','rmb','husky','taurus','reps','stock','1','100'}

def normal(s):
 s=re.sub(r'[⭐★🔥✅❗🆕]', '',s or '').lower().replace('’',"'")
 s=s.replace('t-shirt','t shirt').replace('arcteryx','arc teryx')
 return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9\u4e00-\u9fff]+',' ',s)).strip()

def brand_name(s):
 s=normal(s)
 for name,aliases in sorted(ALIASES.items(),key=lambda x:-max(len(a) for a in x[1])):
  for alias in aliases:
   if re.search(r'(?<!\w)'+re.escape(normal(alias))+r'(?!\w)',s):
    return name
 return 'Other'

def matches(category,requested):
 name=normal(category)
 if normal(requested)=='all':return True
 name_alias=ALIASES.get(next((x for x in ALIASES if normal(x)==normal(requested)),''),[requested])
 return any(bool(re.search(r'(?<!\w)'+re.escape(normal(a))+r'(?!\w)',name)) for a in name_alias if normal(a))

def is_yupoo(url):
 h=(urlparse(url).hostname or '').lower()
 return h.endswith('.x.yupoo.com') and h.count('.')>=3 and urlparse(url).scheme in ('https','http')

def safe_url(u,origin):
 u=urljoin(origin,u or '')
 return u if urlparse(u).scheme in ('https','http') else ''

def uid(url):
 p=urlparse(url);q=parse_qsl(p.query)
 if not any(k=='uid' for k,v in q):q.append(('uid','1'))
 return urlunparse(p._replace(query=urlencode(q)))

def fetch(url,delay=0.6):
 time.sleep(delay)
 r=requests.get(url,headers=HEADERS,timeout=(12,35))
 r.raise_for_status()
 if any(s in r.text.lower() for s in ('captcha required','too many requests','access denied','enable javascript to continue')):
  raise RuntimeError('Yupoo has blocked automated access')
 return r.text

def discover(html,origin,seller):
 soup=BeautifulSoup(html,'html.parser');out={}
 for a in soup.select('a[href]'):
  url=safe_url(a.get('href'),origin)
  if not is_yupoo(url):continue
  label=a.get_text(' ',strip=True) or a.get('title','') or ''
  if not label:
   label=a.parent.get_text(' ',strip=True)[:100] if a.parent else ''
  if len(label)>110:label=label[:110]
  path=urlparse(url).path
  owncat=CATEGORY_RX.search(path)
  external=urlparse(url).hostname!=urlparse(origin).hostname
  if not owncat and not external:continue
  if not label:label='Linked Yupoo'
  clean=url.split('?')[0].rstrip('/')
  key=(urlparse(url).hostname,clean)
  out[key]={'seller':seller,'name':label,'brand':brand_name(label),'url':clean,
           'kind':'linked_yupoo' if external else 'category',
           'linked_from':origin if external else None}
 # Text-only Yupoo links (some sellers put the URL in category descriptions).
 for raw in LINKED_RX.findall(soup.get_text(' ',strip=True)):
  url=raw.rstrip('.,;)')
  if not is_yupoo(url) or urlparse(url).hostname==urlparse(origin).hostname:continue
  key=(urlparse(url).hostname,url.split('?')[0])
  out.setdefault(key,{'seller':seller,'name':'Linked Yupoo','brand':'Other','url':url.split('?')[0],'kind':'linked_yupoo','linked_from':origin})
 return list(out.values())

def parse_listing(html,seller,origin,source,brand_hint):
 soup=BeautifulSoup(html,'html.parser');out={}
 for a in soup.select('a[href*="/albums/"]'):
  url=safe_url(a.get('href'),origin);m=ALBUM_RX.search(urlparse(url).path)
  if not m:continue
  album=m.group(1);card=a
  for anc in [a]+list(a.parents)[:7]:
   if not hasattr(anc,'get'):continue
   cls=' '.join(anc.get('class') or [])
   if ('album' in cls and any(k in cls for k in ('main','children','item'))) or 'showindex__children' in cls:
    card=anc;break
  title=''
  for sel in ('.album__main__name','.album3__main__name','.album__name','.album3__name','.album__title','.album3__title','.showindex__main__name'):
   n=card.select_one(sel)
   if n and len(n.get_text(' ',strip=True))>=4:
    title=n.get_text(' ',strip=True);break
  if not title:
   title=a.get('title') or a.get_text(' ',strip=True) or card.get_text(' ',strip=True)
  title=title.strip()[:300]
  if len(title)<4 or title.isdigit():continue
  img=''
  for element in card.find_all('img'):
   for k in ('data-src','data-original','data-lazy','src'):
    value=element.get(k,'')
    if value and (not img or 'photo.yupoo.com' in value):
     img=safe_url(value,origin)
     if 'photo.yupoo.com' in value:break
   if img and 'photo.yupoo.com' in img:break
  amounts=set()
  for pair in PRICE_RX.findall(title):
   p=float(pair[0] or pair[1])
   if 0<p<50000:amounts.add(p)
  price=next(iter(amounts)) if len(amounts)==1 else None
  clean=normal(PRICE_RX.sub('',title))
  color=next((c.title() for c in COLORS if re.search(r'(?<!\w)'+re.escape(c)+r'(?!\w)',clean)),'Unknown')
  no_color=clean
  for c in sorted(COLORS,key=len,reverse=True):
   no_color=re.sub(r'(?<!\w)'+re.escape(c)+r'(?!\w)',' ',no_color)
  no_color=re.sub(r'\s+',' ',no_color).strip()
  brand=brand_hint if brand_hint and brand_hint not in ('All','Other') else brand_name(title)
  typ=next((k for k in TYPES if re.search(r'\b'+re.escape(k)+r'\b',no_color)),'other')
  code=re.search(r'\b([a-z]{1,5}\d{3,6})(?:\s+\d{2,4})?\b',no_color)
  words=[w for w in no_color.split() if len(w)>1 and w not in STOP]
  # Only group when product has a recognisable style code or distinctive title.
  if code and brand!='Other':
   group='code:'+normal(brand)+':'+code.group(1)
  elif brand!='Other' and len(words)>=4:
   group='text:'+normal(brand)+':'+typ+':'+ ' '.join(sorted(set(words)))[:160]
  else:
   group='unique:'+seller.lower()+':'+urlparse(url).hostname+':'+album
  ident=seller.lower()+':'+urlparse(url).hostname+':'+album
  out[ident]={'id':ident,'seller':seller,'album_id':album,'url':uid(url),
             'title':title,'brand':brand,'price_yuan':price,'color':color,'group_key':group,
             'image':img,'images':[img] if img else [],'source':source}
 return list(out.values())

def extra_sources(extra,seller,brands):
 result=[]
 for part in extra.split(';'):
  if '=' not in part:continue
  brand,url=part.split('=',1);brand=brand.strip();url=url.strip()
  if not is_yupoo(url):continue
  if not any(matches(brand,b) for b in brands):continue
  result.append({'seller':seller,'name':brand+' (custom)','brand':brand,
                 'url':url.split('?')[0],'kind':'manual_linked_yupoo'})
 return result


def brand_from_request(label):
 if not label or normal(label) in ('all', 'auto', 'other'):
  return None
 return next((name for name in ALIASES if normal(name)==normal(label)), label.strip())

def extract_album(html,seller,url,brand_hint=None):
 """Read metadata and product photos from a single, specifically selected public album."""
 soup=BeautifulSoup(html,'html.parser')
 title=''
 for name in ('og:title','twitter:title'):
  n=soup.find('meta',attrs={'property':name}) or soup.find('meta',attrs={'name':name})
  if n and n.get('content'):title=n['content'].strip();break
 if not title:
  for sel in ('h1','.album__name','.album3__name','.showalbum__header__title','title'):
   n=soup.select_one(sel)
   if n:
    title=n.get_text(' ',strip=True)
    if title:break
 title=re.sub(r'\s*[-|]\s*(?:Yupoo|photo album).*$', '', title, flags=re.I).strip()[:350] or ('Yupoo album '+ALBUM_RX.search(url).group(1))
 photos=[]
 def add_image(u):
  u=safe_url(u,url)
  if urlparse(u).hostname!='photo.yupoo.com':return
  if not re.search(r'\.(?:jpg|jpeg|png|webp)(?:\?|$)',u,re.I):return
  if u not in photos:photos.append(u)
 for key in ('og:image','twitter:image'):
  n=soup.find('meta',attrs={'property':key}) or soup.find('meta',attrs={'name':key})
  if n:add_image(n.get('content',''))
 for im in soup.select('img'):
  for attr in ('data-origin','data-original','data-src','data-lazy','data-photo-src','src'):
   u=im.get(attr,'')
   if u:
    add_image(u)
    if 'photo.yupoo.com' in u:break
 for a in soup.select('a[href]'):
  if 'photo.yupoo.com' in a.get('href',''):add_image(a['href'])
 # Deduplicate same photo in multiple Yupoo resolution sizes.
 byphoto={}
 for u in photos:
  k='/'.join(urlparse(u).path.split('/')[:-1])
  if k not in byphoto or any(x in urlparse(u).path for x in ('/medium.','/large.','/original.')):
   byphoto[k]=u
 photos=list(byphoto.values())[:30]
 m=ALBUM_RX.search(url)
 if not m:raise ValueError('Expected a Yupoo album link')
 clean=normal(PRICE_RX.sub('',title))
 color=next((x.title() for x in COLORS if re.search(r'(?<!\w)'+re.escape(x)+r'(?!\w)',clean)),'Unknown')
 prices=[float(a or b) for a,b in PRICE_RX.findall(title) if 0<float(a or b)<50000]
 price=prices[0] if len(set(prices))==1 else None
 brand=brand_from_request(brand_hint) or brand_name(title)
 album_id=m.group(1);host=urlparse(url).hostname
 ident=seller.lower()+':'+host+':'+album_id
 return {'id':ident,'seller':seller,'album_id':album_id,'url':uid(url),'title':title,
         'brand':brand,'price_yuan':price,'color':color,
         'group_key':'unique:'+ident, 'image':photos[0] if photos else '',
         'images':photos,'source':url}

def photo_cache(offer,limit,stats):
 """Cache permitted public Yupoo photos in GitHub Pages so external hotlinks aren't required."""
 if limit<=0:return
 images=offer.get('images') or ([offer['image']] if offer.get('image') else [])
 cached=[]
 for img in images[:limit]:
  if img.startswith('images/'):
   cached.append(img);continue
  if not img.startswith('https://photo.yupoo.com/'):
   continue
  key=hashlib.sha256(img.encode()).hexdigest()[:20]
  existing=list((ROOT/'docs'/'images').glob(key+'.*'))
  if existing:
   cached.append('images/'+existing[0].name);continue
  if stats['count']>=stats['max']:break
  for candidate in [img,
     re.sub(r'/(small|medium|large)\.jpg(?:\?.*)?$', '/medium.jpg', img),
     re.sub(r'/(small|medium|large)\.jpg(?:\?.*)?$', '/large.jpg', img)]:
   try:
    response=requests.get(candidate,headers=HEADERS,timeout=(8,18))
    typ=response.headers.get('content-type','').lower().split(';')[0]
    if response.ok and typ.startswith('image/') and len(response.content)>700:
     ext='.png' if typ=='image/png' else '.webp' if typ=='image/webp' else '.jpg'
     output=ROOT/'docs'/'images'/(key+ext)
     output.parent.mkdir(parents=True,exist_ok=True)
     output.write_bytes(response.content)
     cached.append('images/'+output.name)
     stats['count']+=1
     break
   except requests.RequestException:pass
 if cached:
  offer['images']=cached
  offer['image']=cached[0]

def prune_unknown_source(source, source_brand, offer):
 """Prefer an explicit brand provided by the user or source, not unrelated title substrings."""
 given=brand_from_request(source_brand)
 if given:
  offer['brand']=given
 elif source.get('brand') not in ('Other', None, ''):
  offer['brand']=source['brand']
 else:
  offer['brand']=brand_name(offer['title'])
 return offer

def import_source(args, seller, url, brand, offers, sources, notes, stats):
 if not is_yupoo(url):
  raise ValueError('The link must be https://SOMETHING.x.yupoo.com/albums/ID or /categories/ID')
 if urlparse(url).scheme!='https':
  raise ValueError('Only https Yupoo links are supported')
 origin='https://'+urlparse(url).hostname
 path=urlparse(url).path
 album=ALBUM_RX.search(path)
 is_category=bool(CATEGORY_RX.search(path))
 if path.rstrip('/') not in ('','/','/albums') and not (album or is_category):
  raise ValueError('Please use a Yupoo album, category, or shop homepage URL')
 source={'seller':seller,'name':brand or ('Album '+album.group(1) if album else 'Catalogue'),
         'brand':brand_from_request(brand) or 'Other',
         'url':url.split('?')[0],'kind':'selected_album' if album else 'selected_category'}
 sources[seller+'|'+source['url']]=source
 if album:
  html=fetch(url,args.delay)
  item=extract_album(html,seller,url,brand)
  # Prefer title from index when present, and album details' photos.
  previous=offers.get(item['id'],{})
  if len(item.get('images',[]))==0 and previous.get('images'):
   item['images']=previous['images']
   item['image']=previous['image']
  photo_cache(item,30,stats)
  offers[item['id']]=item
  return 1
 base=source['url'].rstrip('/')
 if path.rstrip('/') in ('','/'):base=origin+'/albums/'
 found_ids=set();total=0
 for p in range(1,args.pages+1):
  joiner='&' if '?' in base else '?'
  paged=base+joiner+'page='+str(p)
  try:
   html=fetch(paged,args.delay)
   new=parse_listing(html,seller,origin,source['url'],source['brand'])
  except Exception as e:
   notes.append(source['url']+' page '+str(p)+': '+str(e))
   break
  fresh=[o for o in new if o['id'] not in found_ids]
  if not fresh:break
  for o in fresh:
   found_ids.add(o['id'])
   o=prune_unknown_source(source,brand,o)
   photo_cache(o,1,stats)
   offers[o['id']]=o
   total+=1
   if total>=args.max_offers:break
  if total>=args.max_offers:break
 return total

def main(args):
 if args.sellers=='Both' and args.url:
  raise ValueError('Choose Husky or Taurus when importing one Yupoo link')
 try:db=json.loads(DEST.read_text(encoding='utf8'))
 except (OSError,json.JSONDecodeError):db={'version':3,'offers':[],'sources':[]}
 offers={o['id']:o for o in db.get('offers',[]) if o.get('id')}
 sources={s['seller']+'|'+s['url']:s for s in db.get('sources',[]) if s.get('seller') and s.get('url')}
 notes=[];count=0
 stats={'count':0,'max':max(0,args.image_limit)}
 stamp=datetime.now(timezone.utc).isoformat(timespec='seconds')
 if args.url:
  seller=args.sellers
  count=import_source(args,seller,args.url,args.brand,offers,sources,notes,stats)
 else:
  brands=[x.strip() for x in args.brands.split(',') if x.strip()]
  if not brands:raise ValueError('Choose brands, or enter a Yupoo URL')
  if any(normal(x)=='all' for x in brands) and len(brands)!=1:raise ValueError('ALL must be used alone')
  all_mode=len(brands)==1 and brands[0].upper()=='ALL'
  for seller in SELLERS if args.sellers=='Both' else [args.sellers]:
   origin=SELLERS[seller];discovered=[]
   for page in (origin+'/categories/',origin+'/albums/?page=1'):
    try:discovered.extend(discover(fetch(page,args.delay),origin,seller))
    except Exception as e:notes.append('Discovery error '+page+': '+str(e))
   for src in discovered+extra_sources(args.extra_sources,seller,brands):
    sources[seller+'|'+src['url']]=src
   candidates=[s for s in sources.values() if s['seller']==seller and
    (all_mode or any(matches(s.get('name',''),b) or matches(s.get('brand',''),b) for b in brands))]
   if not candidates:notes.append(seller+': no matching categories for '+', '.join(brands))
   for source in candidates[:args.max_sources]:
    try:
     count+=import_source(args,seller,source['url'],source.get('brand'),offers,sources,notes,stats)
    except Exception as e:notes.append('Source '+source['url']+': '+str(e))
    if count>=args.max_offers:break
 db={'version':3,'updated_at':stamp if count else db.get('updated_at'),
     'last_attempt':stamp,'offers':sorted(offers.values(),key=lambda o:o['id']),
     'sources':sorted(sources.values(),key=lambda s:(s['seller'],s['name'])),
     'sync_notes':notes,'last_import_count':count,'cached_images_this_run':stats['count']}
 DEST.parent.mkdir(parents=True,exist_ok=True)
 DEST.write_text(json.dumps(db,ensure_ascii=False,indent=2),encoding='utf8')
 print('Imported',count,'offers;',len(offers),'total;',stats['count'],'images cached;',len(notes),'warnings')
 for note in notes[:40]:print('NOTE',note)
 if count==0:
  raise SystemExit('No items imported. Check album URL, category and GitHub Actions log.')

if __name__=='__main__':
 p=argparse.ArgumentParser()
 p.add_argument('--sellers',choices=['Both','Husky','Taurus'],default='Both')
 p.add_argument('--brands',default='Stone Island,Moncler,Nike,Essentials')
 p.add_argument('--url',default='',help='Specific Yupoo album, category or shop homepage')
 p.add_argument('--brand',default='',help='Optional brand for URL imports')
 p.add_argument('--extra-sources',default='')
 p.add_argument('--pages',type=int,default=2)
 p.add_argument('--max-sources',type=int,default=20)
 p.add_argument('--max-offers',type=int,default=800)
 p.add_argument('--image-limit',type=int,default=100)
 p.add_argument('--delay',type=float,default=.6)
 args=p.parse_args()
 args.pages=max(1,min(20,args.pages))
 args.max_sources=max(1,min(100,args.max_sources))
 args.max_offers=max(1,min(10000,args.max_offers))
 args.image_limit=max(0,min(250,args.image_limit))
 args.delay=max(.5,args.delay)
 main(args)
