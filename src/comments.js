import {deploymentUrl} from './attachments.js';
const canonical=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function actions(data){return data?.actions || data?.data?.actions || [];}
function list(value){return Array.isArray(value)?value:Object.values(value||{});}
export function createCommentClient({baseUrl,auth,timeoutMs,tokenTtlMs=3000000,call}){
  let session,loginAt=0;
  async function request(module,method,params={},body,cookie){
    const url=deploymentUrl(baseUrl,'index.php');
    url.search=new URLSearchParams({m:module,f:method,t:'json',...params}).toString();
    const response=await fetch(url,{method:body?'POST':'GET',headers:{Referer:deploymentUrl(baseUrl,'index.php').href,'X-Requested-With':'XMLHttpRequest',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:body?new URLSearchParams(body):undefined,redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)throw new Error(`ZenTao page API failed: HTTP ${response.status}`);
    const text=await response.text();let result;
    try{result=JSON.parse(text);}catch{
      if(module==='action')return {responseFormat:'non-json'}; // Legacy success may be a reload script. Never execute it; require history read-back.
      throw new Error('ZenTao page API returned non-JSON; check page API availability and login');
    }
    if(result.status==='success'&&result.data)result=typeof result.data==='string'?JSON.parse(result.data):result.data;
    if(result?.load==='login') session=undefined;
    if(result?.error || result?.result===false || result?.result==='fail' || result?.status==='fail' || result?.load==='login')throw new Error('ZenTao page API rejected the request; check login, permissions or validation');
    return result;
  }
  async function login(){
    if(session&&Date.now()-loginAt<tokenTtlMs)return session;
    const data=await request('api','getSessionID');
    if(!/^[\w-]+$/.test(data?.sessionName||'') || !/^[\w,-]+$/.test(data?.sessionID||''))throw new Error('Invalid ZenTao page session response');
    const result=await request('user','login',{},auth,`${data.sessionName}=${data.sessionID}`);
    if(result.status!=='success'||!/^[\w,-]+$/.test(result.token||''))throw new Error('ZenTao page login failed');
    session=`${data.sessionName}=${result.token}`;loginAt=Date.now();return session;
  }
  async function write({id,comment,actionId}){
    if(!Number.isSafeInteger(id)||id<1)throw new Error('Bug id must be a positive integer');
    if(typeof comment!=='string'||!canonical(comment))throw new Error('comment must contain non-empty text');
    const before=(await call({path:`/bugs/${id}`})).data;
    const previous=list(actions(before));
    if(actionId!==undefined && (!Number.isSafeInteger(actionId)||actionId<1||!previous.some(a=>Number(a.id)===actionId&&String(a.action).toLowerCase()==='commented')))throw new Error('actionId must identify a comment belonging to this Bug');

    const cookie=await login();
    // Writes are never automatically retried: a timed-out response can already have saved.
    await request('action',actionId?'editComment':'comment',actionId?{actionID:String(actionId)}:{objectType:'bug',objectID:String(id)},actionId?{lastComment:comment}:{comment},cookie);
    let after;
    try{after=list(actions((await call({path:`/bugs/${id}`})).data));}catch{ return {id,comment,commented:false,edited:false,verified:false,writeSubmitted:true,doNotRetryWrite:true,error:'Write submitted but read-back failed; inspect Bug history before retrying'}; }
    const oldIds=new Set(previous.map(a=>String(a.id)));
    const match=after.find(a=>(actionId?Number(a.id)===actionId:!oldIds.has(String(a.id)))&&canonical(a.comment)===canonical(comment));
    if(!match)return {id,comment,commented:false,edited:false,verified:false,writeSubmitted:true,doNotRetryWrite:true,error:'Write submitted but expected comment was not found on read-back'};
    return {id,actionId:Number(match.id),comment,commented:!actionId,edited:Boolean(actionId),verified:true};
  }
  return {write};
}
