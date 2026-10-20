#!/usr/bin/env python3
"""Discover public linked Yupoo hosts in Husky categories and selected albums.
Does not guess or fabricate links. Run with GitHub Actions; retains previous confirmed links.
"""
import json,re,time,os,sys
from pathlib import Path
from urllib.parse import urljoin,urlparse
import requests
from bs4 import BeautifulSoup
FILE=Path("docs/data/husky_categories.json")
ALLOWED=re.compile(r"^[a-z0-9-]+\.x\.yupoo\.com$",re.I)
RE=re.compile(r"https?://[a-z0-9-]+\.x\.yupoo\.com(?:/[^\s\"'<>]*)?",re.I)
HEADERS={"User-Agent":"Mozilla/5.0 (compatible; REP-ATLAS/1.0; +https://github.com/TronikTTV/rep-atlas)"}
def linked(html,page):
    soup=BeautifulSoup(html,"html.parser")
    found={}
    for tag in soup.select("a[href]"):
        raw=tag.get("href","")
        try:u=urljoin(page,raw); host=urlparse(u).hostname or ""
        except ValueError:continue
        if not ALLOWED.fullmatch(host) or host in ("huskyreps.x.yupoo.com","undefined.x.yupoo.com"):continue
        label=tag.get_text(" ",strip=True)[:100]
        found[u.split("#")[0]]={"url":u.split("#")[0],"label":label or host,"found_on":page}
    for raw in RE.findall(html.replace("\\/","/")):
        u=raw.rstrip(".,;)}]")
        host=urlparse(u).hostname or ""
        if not ALLOWED.fullmatch(host) or host in ("huskyreps.x.yupoo.com","undefined.x.yupoo.com"):continue
        found.setdefault(u,{"url":u,"label":host,"found_on":page})
    return list(found.values())
def run():
    d=json.loads(FILE.read_text(encoding="utf8"))
    categories=d["categories"]
    ses=requests.Session();ses.headers.update(HEADERS)
    scanned=0;errors=0;found=0
    for i,cat in enumerate(categories):
        if cat.get("type")=="hidden":continue
        pages=[cat["url"]]
        try:
            r=ses.get(cat["url"],timeout=17);r.raise_for_status()
            soup=BeautifulSoup(r.text,"html.parser")
            # Scan one representative album too, since offsite links can appear inside album descriptions.
            for a in soup.select('a[href*="/albums/"]')[:1]:
                album=urljoin(cat["url"],a.get("href",""))
                if urlparse(album).hostname=="huskyreps.x.yupoo.com":pages.append(album)
            merged={x["url"]:x for x in cat.get("linked_yupoos",[]) if x.get("url")}
            for page in pages:
                try:
                    html=r.text if page==cat["url"] else ses.get(page,timeout=17).text
                    for x in linked(html,page):merged[x["url"]]=x
                except Exception as e:errors+=1;print("album scan error",page,str(e)[:90])
            cat["linked_yupoos"]=list(merged.values())
            cat["discovery_status"]="scanned"
            found+=len(merged)
            scanned+=1
        except Exception as e:
            errors+=1;cat["discovery_status"]="error";print("category scan error",cat["url"],str(e)[:90])
        if i%20==0:
            print("Progress",i+1,"/",len(categories),"new/retained linked",found,flush=True)
            FILE.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
        time.sleep(0.25)
    d["last_link_scan"]=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    FILE.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("Done:",scanned,"categories scanned;",found,"linked URLs;",errors,"errors")
    if scanned==0:sys.exit("Could not scan any Husky categories")
if __name__=="__main__":run()
