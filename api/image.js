module.exports=async function handler(req,res){
 const value=String(req.query.url||'');let u;
 try{u=new URL(value)}catch{return res.status(400).send('Bad image URL')}
 if(u.protocol!=='https:'||u.hostname!=='photo.yupoo.com'|| !/\.(jpe?g|png|webp)$/i.test(u.pathname))return res.status(400).send('Invalid image host');
 try{
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
   let r;
   try{r=await fetch(u.href,{redirect:'error',signal:ctl.signal,headers:{'user-agent':'Mozilla/5.0','referer':'https://huskyreps.x.yupoo.com/'}})}finally{clearTimeout(timer)}
   const t=(r.headers.get('content-type')||'').split(';')[0].trim();
   if(!r.ok||!/^image\/(?:jpeg|png|webp)$/.test(t))return res.status(404).send('Image unavailable');
   const data=Buffer.from(await r.arrayBuffer());
   if(data.byteLength>7_500_000)return res.status(413).send('Image too large');
   res.setHeader('Content-Type',t);res.setHeader('Cache-Control','public, s-maxage=604800, stale-while-revalidate=86400');
   res.send(data)
 }catch(e){return res.status(502).send('Unable to retrieve photo')}
}