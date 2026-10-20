#!/usr/bin/env python3
"""Fast index-first catalogue sync for REP ATLAS."""
import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).parent
CATALOGUE_PATH=ROOT/"docs"/"data"/"catalogue.json"
DIRECTORY_PATH=ROOT/"docs"/"data"/"catalogues.json"
CATALOGS=[
 {"id":"husky-main","seller":"Husky","name":"Husky Reps","origin":"https://huskyreps.x.yupoo.com"},
 {"id":"husky-alaska","seller":"Husky","name":"Alaska · Husky Extra","origin":"https://alaskareps.x.yupoo.com"},
 {"id":"taurus-main","seller":"Taurus","name":"Taurus Reps","origin":"https://deateath.x.yupoo.com"},
 {"id":"taurus-scorpio","seller":"Taurus","name":"Scorpio · Taurus Extra","origin":"https://scorpio-reps.x.yupoo.com"},
 {"id":"taurus-pisces","seller":"Taurus","name":"Pisces · Taurus Extra","origin":"https://pisces-reps.x.yupoo.com"},
]
HEADERS={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36","Accept-Language":"en-GB,en;q=0.9"}
ALIASES={
 "Stone Island":["stone island","stn island","s i d","s id"],"Nike":["nike","n k","nk","nke"],
 "Moncler":["moncler","m n c l r","m c r","mnlr"],"Essentials":["essentials","fear of god","fog"],
 "Prada":["prada","p r a","pdra"],"Ralph Lauren":["ralph lauren","raph au en","raphauen","polo"],
 "The North Face":["the north face","north face","t n f","tnf"],"Arc’teryx":["arcteryx","arc teryx"],
 "Palace":["palace","palae"],"Corteiz":["corteiz","crt z","ctz"],"Bape":["bape","a bathing ape"],
 "CP Company":["cp company","c p company"],"Louis Vuitton":["louis vuitton","l v"],"Canada Goose":["canada goose"],
 "Stussy":["stussy","st s y"],"Burberry":["burberry"],"Supreme":["supreme"],"Adidas":["adidas"],
 "Carhartt":["carhartt"],"Trapstar":["trapstar"],"Amiri":["amiri"],"Monterrain":["monterrain"],
 "Montirex":["montirex"],"Berghaus":["berghaus"],"Nocta":["nocta"],
}
COLORS=("black grey pink","grey pink","dark grey","light grey","navy blue","baby blue","off white","olive green","black","white","grey","gray","pink","red","blue","green","yellow","orange","purple","brown","beige","cream","navy","khaki","olive","silver","gold")
ALBUM_RE=re.compile(r"/albums/(\d+)")
CATEGORY_RE=re.compile(r"/(categories|collections)/(\d+)")
PHOTO_RE=re.compile(r"\.(?:jpe?g|png|webp)(?:\?|$)",re.I)
PRICE_RE=re.compile(r"(?:[¥￥]\s*[~≈：:=]?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:rmb|yuan|[¥￥]))",re.I)
BLOCKED=("captcha required","too many requests","access denied","enable javascript to continue")

def normal(value):
 value=re.sub(r"[⭐★🔥✅❗🆕]"," ",value or "").lower().replace("’","'")
 return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9\u4e00-\u9fff]+"," ",value)).strip()

def brand_name(value):
 text=normal(value)
 for name,aliases in sorted(ALIASES.items(),key=lambda item:-max(map(len,item[1]))):
  if any(re.search(r"(?<!\w)"+re.escape(normal(alias))+r"(?!\w)",text) for alias in aliases):return name
 return "Other"

def category_type(label,brand):
 text=normal(label)
 if brand!="Other":return "brand"
 if any(word in text for word in ("hoodie","jacket","pants","trouser","shirt","sweater","shoes","bag","hat","shorts","suit")):return "clothing"
 return "collection"

def fetch(url,retries=3):
 last=None
 for attempt in range(retries):
  try:
   response=requests.get(url,headers=HEADERS,timeout=(10,30))
   if response.status_code in (429,500,502,503,504):raise requests.HTTPError("HTTP "+str(response.status_code))
   response.raise_for_status()
   if any(marker in response.text.lower() for marker in BLOCKED):raise RuntimeError("Yupoo blocked the request")
   return response.text
  except Exception as exc:
   last=exc
   if attempt+1<retries:time.sleep(.7*(attempt+1))
 raise last

def safe_url(raw,base):
 try:
  url=urljoin(base,raw or "");parsed=urlparse(url)
  return url if parsed.scheme in ("http","https") else ""
 except Exception:return ""

def with_uid(url):
 parsed=urlparse(url);query=parse_qs(parsed.query,keep_blank_values=True);query.setdefault("uid",["1"])
 return urlunparse(parsed._replace(query=urlencode(query,doseq=True)))

def photo_url(raw,base):
 url=safe_url((raw or "").replace("\\/","/"),base);parsed=urlparse(url)
 if parsed.hostname!="photo.yupoo.com" or not PHOTO_RE.search(parsed.path):return ""
 return re.sub(r"/small\.(jpe?g|png|webp)$",r"/medium.\1",url,flags=re.I)

def max_page(html):
 soup=BeautifulSoup(html,"html.parser");pages=[1]
 for anchor in soup.select("a[href]"):
  try:pages.extend(int(value) for value in parse_qs(urlparse(anchor.get("href","")).query).get("page",[]) if value.isdigit())
  except Exception:pass
 return min(max(pages),120)

def discover_categories(catalog,workers):
 origin=catalog["origin"];found={}
 for route in ("categories","collections"):
  try:first=fetch(f"{origin}/{route}?page=1")
  except Exception:continue
  pages={1:first};maximum=max_page(first)
  if maximum>1:
   with ThreadPoolExecutor(max_workers=min(workers,maximum-1)) as pool:
    jobs={pool.submit(fetch,f"{origin}/{route}?page={page}"):page for page in range(2,maximum+1)}
    for job in as_completed(jobs):
     try:pages[jobs[job]]=job.result()
     except Exception:pass
  for html in pages.values():
   soup=BeautifulSoup(html,"html.parser")
   for anchor in soup.select('a[href*="/categories/"],a[href*="/collections/"]'):
    url=safe_url(anchor.get("href"),origin);parsed=urlparse(url);match=CATEGORY_RE.search(parsed.path)
    if not match or parsed.hostname!=urlparse(origin).hostname:continue
    kind,remote_id=match.groups();label=anchor.get_text(" ",strip=True) or anchor.get("title","")
    if not label and anchor.parent:label=anchor.parent.get_text(" ",strip=True)
    label=re.sub(r"\s+"," ",label).strip()[:120]
    if not label or label.isdigit():continue
    brand=brand_name(label);cid=f"{parsed.hostname}:{kind}:{remote_id}"
    record={"id":cid,"remote_id":remote_id,"remote_kind":kind,"seller":catalog["seller"],"catalogue_id":catalog["id"],"store_name":catalog["name"],"name":label,"original_name":label,"brand":brand,"type":category_type(label,brand),"url":f"{origin}/{kind}/{remote_id}","product_count":0}
    if cid not in found or len(label)>len(found[cid]["name"]):found[cid]=record
 return found

def pick_card(anchor):
 for parent in [anchor]+list(anchor.parents)[:8]:
  classes=" ".join(parent.get("class") or []) if hasattr(parent,"get") else ""
  if ("album" in classes and any(word in classes for word in ("main","children","item"))) or "showindex__children" in classes:return parent
 return anchor.parent or anchor

def parse_price(title):
 values=[]
 for first,second in PRICE_RE.findall(title or ""):
  try:
   number=float(first or second)
   if 0<number<50000:values.append(number)
  except ValueError:pass
 unique=sorted(set(values))
 if not unique:return None,""
 render=lambda n:str(int(n)) if n.is_integer() else str(n)
 if len(unique)==1:return unique[0],"¥"+render(unique[0])
 return unique[0],"¥"+render(unique[0])+"–"+render(unique[-1])

def parse_listing(html,catalog,categories,page_url):
 soup=BeautifulSoup(html,"html.parser");origin=catalog["origin"];hostname=urlparse(origin).hostname;results={}
 categories_by_remote={item["remote_id"]:item for item in categories.values()}
 for anchor in soup.select('a[href*="/albums/"]'):
  href=safe_url(anchor.get("href"),origin);parsed=urlparse(href);match=ALBUM_RE.search(parsed.path)
  if not match or parsed.hostname!=hostname:continue
  album_id=match.group(1);card=pick_card(anchor);title=""
  for selector in (".album__main__name",".album3__main__name",".album__name",".album3__name",".album__title",".album3__title",".showindex__main__name",'[class*="name"]'):
   node=card.select_one(selector) if hasattr(card,"select_one") else None
   if node and len(node.get_text(" ",strip=True))>=4:title=node.get_text(" ",strip=True);break
  title=(title or anchor.get("title") or anchor.get_text(" ",strip=True) or card.get_text(" ",strip=True)).strip()[:350]
  if len(title)<4 or title.isdigit():continue
  image=""
  for element in card.find_all("img") if hasattr(card,"find_all") else []:
   for attribute in ("data-origin","data-original","data-src","data-lazy","src"):
    image=photo_url(element.get(attribute),origin)
    if image:break
   if image:break
  query=parse_qs(parsed.query);category_remote=next(iter(query.get("referrercate",[]) or query.get("category_id",[])),"")
  if not category_remote and hasattr(card,"select_one"):
   category_anchor=card.select_one('a[href*="/categories/"],a[href*="/collections/"]')
   if category_anchor:
    category_match=CATEGORY_RE.search(urlparse(safe_url(category_anchor.get("href"),origin)).path)
    category_remote=category_match.group(2) if category_match else ""
  category=categories_by_remote.get(category_remote)
  brand=category["brand"] if category and category["brand"]!="Other" else brand_name(title)
  price_yuan,price_text=parse_price(title);cleaned=normal(PRICE_RE.sub("",title))
  color=next((colour.title() for colour in COLORS if re.search(r"(?<!\w)"+re.escape(colour)+r"(?!\w)",cleaned)),"Unknown")
  offer_id=f"{catalog['seller'].lower()}:{hostname}:{album_id}"
  results[offer_id]={"id":offer_id,"seller":catalog["seller"],"catalogue_id":catalog["id"],"store_name":catalog["name"],"album_id":album_id,"url":with_uid(href),"title":title,"brand":brand,"price_yuan":price_yuan,"price_text":price_text,"color":color,"group_key":"unique:"+offer_id,"image":image,"images":[image] if image else [],"gallery_loaded":False,"source":category["url"] if category else origin+"/albums","category_id":category["id"] if category else "","category_name":category["name"] if category else "","listing_page":page_url}
 return list(results.values())

def scan_catalog(catalog,max_pages,workers):
 categories=discover_categories(catalog,workers);origin=catalog["origin"];offers={};notes=[];page=1
 while page<=max_pages:
  batch=list(range(page,min(page+workers,max_pages+1)));payloads={}
  with ThreadPoolExecutor(max_workers=workers) as pool:
   jobs={pool.submit(fetch,f"{origin}/albums?page={number}"):number for number in batch}
   for job in as_completed(jobs):
    number=jobs[job]
    try:payloads[number]=job.result()
    except Exception as exc:notes.append(f"{catalog['name']} page {number}: {exc}");payloads[number]=""
  new_count=0;nonempty_pages=0
  for number in batch:
   html=payloads.get(number,"")
   if not html:continue
   products=parse_listing(html,catalog,categories,f"{origin}/albums?page={number}")
   if products:nonempty_pages+=1
   for product in products:
    if product["id"] not in offers:new_count+=1
    offers[product["id"]]=product
  print(f"{catalog['name']}: pages {batch[0]}-{batch[-1]}, {len(offers)} products")
  if new_count==0 or nonempty_pages==0:break
  page+=workers
 counts={}
 for offer in offers.values():
  if offer.get("category_id"):counts[offer["category_id"]]=counts.get(offer["category_id"],0)+1
 for cid,category in categories.items():category["product_count"]=counts.get(cid,0)
 return offers,categories,notes

def host_from_offer(offer):
 try:return urlparse(offer.get("url","")).hostname or offer.get("id","").split(":")[1]
 except Exception:return ""

def main():
 parser=argparse.ArgumentParser();parser.add_argument("--max-pages",type=int,default=120);parser.add_argument("--workers",type=int,default=8);args=parser.parse_args()
 args.max_pages=max(1,min(200,args.max_pages));args.workers=max(2,min(12,args.workers))
 try:previous=json.loads(CATALOGUE_PATH.read_text(encoding="utf8"))
 except Exception:previous={"offers":[],"sources":[]}
 known_hosts={urlparse(item["origin"]).hostname for item in CATALOGS}
 preserved={offer["id"]:offer for offer in previous.get("offers",[]) if offer.get("id") and host_from_offer(offer) not in known_hosts}
 previous_by_id={offer.get("id"):offer for offer in previous.get("offers",[]) if offer.get("id")}
 all_offers=dict(preserved);all_categories={};notes=[];store_rows=[];scanned=0
 for catalog in CATALOGS:
  try:
   offers,categories,store_notes=scan_catalog(catalog,args.max_pages,args.workers)
   for offer_id,offer in offers.items():
    old=previous_by_id.get(offer_id,{})
    if len(old.get("images") or [])>1:offer["images"]=old["images"];offer["image"]=old.get("image") or offer["image"];offer["gallery_loaded"]=old.get("gallery_loaded",True)
    all_offers[offer_id]=offer
   all_categories.update(categories);notes.extend(store_notes);scanned+=len(offers)
   store_rows.append({**catalog,"product_count":len(offers),"category_count":len(categories)})
  except Exception as exc:notes.append(f"{catalog['name']}: {exc}");store_rows.append({**catalog,"product_count":0,"category_count":0,"error":str(exc)})
 if scanned==0:raise SystemExit("No catalogues could be scanned; existing data was not overwritten.")
 stamp=datetime.now(timezone.utc).isoformat(timespec="seconds");sources=[]
 for store in store_rows:sources.append({"seller":store["seller"],"name":store["name"],"brand":"All","url":store["origin"],"kind":"store","catalogue_id":store["id"]})
 sources.extend({"seller":category["seller"],"name":category["name"],"brand":category["brand"],"url":category["url"],"kind":category["remote_kind"],"catalogue_id":category["catalogue_id"]} for category in all_categories.values())
 database={"version":4,"updated_at":stamp,"last_attempt":stamp,"offers":sorted(all_offers.values(),key=lambda offer:offer["id"]),"sources":sorted(sources,key=lambda source:(source["seller"],source["name"])),"sync_notes":notes[:100],"last_import_count":scanned,"cached_images_this_run":0,"sync_mode":"parallel-index-first"}
 directory={"version":1,"updated_at":stamp,"stores":store_rows,"categories":sorted(all_categories.values(),key=lambda category:(category["seller"],category["store_name"],category["name"]))}
 CATALOGUE_PATH.parent.mkdir(parents=True,exist_ok=True);CATALOGUE_PATH.write_text(json.dumps(database,ensure_ascii=False,indent=2),encoding="utf8");DIRECTORY_PATH.write_text(json.dumps(directory,ensure_ascii=False,indent=2),encoding="utf8")
 print(f"Saved {len(database['offers'])} offers ({scanned} refreshed) from {len(CATALOGS)} stores.")
 for note in notes[:30]:print("NOTE",note)

if __name__=="__main__":main()
