const json=(res,status,data)=>{res.status(status).setHeader('Content-Type','application/json; charset=utf-8').setHeader('Cache-Control','no-store').setHeader('Pragma','no-cache').setHeader('X-Content-Type-Options','nosniff');return res.end(JSON.stringify(data))};
const abortFetch=async(url,options={})=>{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timeout)}};
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'Gunakan POST'});
 const size=Number(req.headers['content-length']||0);if(size>150000)return json(res,413,{error:'Permintaan terlalu besar'});
 const {email,refreshToken,clientId}=req.body||{};
 if(!email||!refreshToken||!clientId||typeof email!=='string'||typeof refreshToken!=='string'||typeof clientId!=='string'||email.length>254||refreshToken.length>12000||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(clientId))return json(res,400,{error:'Email, refresh token, atau client ID tidak valid'});
 try{
  const form=new URLSearchParams({client_id:clientId,grant_type:'refresh_token',refresh_token:refreshToken,scope:'https://graph.microsoft.com/Mail.Read offline_access'});
  const tokenResponse=await abortFetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
  const token=await tokenResponse.json();
  if(!tokenResponse.ok||!token.access_token)return json(res,401,{error:'Token Microsoft ditolak. Pastikan refresh token, client ID, dan izin Mail.Read cocok.'});
  const headers={Authorization:`Bearer ${token.access_token}`,Accept:'application/json',Prefer:'outlook.body-content-type="text"'};
  const options=new URLSearchParams({'$top':'15','$select':'id,subject,bodyPreview,body,from,receivedDateTime','$orderby':'receivedDateTime desc'});
  const folders=['inbox','junkemail'];const results=[];let failed=0,limited=false;
  for(const folder of folders){const response=await abortFetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?${options}`,{headers});if(!response.ok){failed++;if(response.status===429)limited=true;continue}const payload=await response.json();for(const message of payload.value||[]){results.push({id:message.id,folder,subject:message.subject||'',preview:message.bodyPreview||'',content:(message.body||{}).content||'',from:message.from?.emailAddress?.address||'',name:message.from?.emailAddress?.name||'',time:message.receivedDateTime||''})}}
  if(failed===2)return json(res,limited?429:502,{error:limited?'Microsoft membatasi permintaan. Perlambat auto refresh.':'Inbox dan Junk gagal dibaca. Periksa izin Mail.Read dan akun.'});
  results.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  return json(res,200,{messages:results,refreshToken:token.refresh_token||refreshToken,partial:failed>0});
 }catch(e){return json(res,502,{error:e?.name==='AbortError'?'Microsoft terlalu lama merespons. Coba lagi.':'Gagal menghubungi Microsoft. Coba lagi.'})}
};
