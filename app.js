// Minha Agenda — versão para hospedar (GitHub Pages + Firebase)
import { firebaseConfig, DONO_EMAIL, EMAILJS, NOME_PADRAO } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile,
  reauthenticateWithCredential, EmailAuthProvider, deleteUser,
  setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, onSnapshot, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = s => document.querySelector(s);
const DONO = String(DONO_EMAIL || "").trim().toLowerCase();
const CONFIGURADO = !!firebaseConfig?.apiKey && !/COLE|SUA_|XXXX/i.test(firebaseConfig.apiKey);

/* ================= utilidades ================= */
const PRIO = {baixa:{n:"Baixa",c:"var(--p-baixa)",o:3},media:{n:"Média",c:"var(--p-media)",o:2},alta:{n:"Alta",c:"var(--p-alta)",o:1},urgente:{n:"Urgente",c:"var(--p-urgente)",o:0}};
const REC = {diaria:"Diária",semanal:"Semanal",mensal:"Mensal",anual:"Anual"};
const PLANOS = {dias:"Dias",mensal:"Mensal",semestral:"6 meses",anual:"Anual",periodo:"Período",sempre:"Sem prazo"};
const NIVEL = {ver:"Só ver",editar:"Ver e editar"};
const brl = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
const TODAY = iso(new Date());
function parse(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=parse(s);d.setDate(d.getDate()+n);return iso(d)}
function addMonths(s,n){const d=parse(s),day=d.getDate(),y=d.getFullYear(),m=d.getMonth()+n;const last=new Date(y,m+1,0).getDate();return iso(new Date(y,m,Math.min(day,last)))}
function nextDate(s,rec){
  if(rec==="diaria") return addDays(s,1);
  if(rec==="semanal") return addDays(s,7);
  if(rec==="mensal") return addMonths(s,1);
  if(rec==="anual") return addMonths(s,12);
  return s;
}
function fmtDate(s){return parse(s).toLocaleDateString("pt-BR")}
function fmtDT(s){const d=new Date(s);return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
function daysLeft(s){return Math.round((parse(s)-parse(TODAY))/864e5)}
function fmtDue(s){
  if(!s) return ""; if(s===TODAY) return "Hoje";
  const n=daysLeft(s); if(n===1) return "Amanhã"; if(n===-1) return "Ontem";
  return parse(s).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}).replace(".","");
}
function parseMoney(v){if(!v)return null;v=String(v).replace(/[^\d,.-]/g,"");if(v.includes(","))v=v.replace(/\./g,"").replace(",",".");const n=parseFloat(v);return isNaN(n)?null:Math.round(n*100)/100}
function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2600)}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function localDay(isoStr){try{return iso(new Date(isoStr))}catch{return ""}}
function isActive(a){return !!a&&(!a.inicio||a.inicio<=TODAY)&&(!a.expira||a.expira>=TODAY)}
function leftInfo(a){
  if(!a) return {t:"Sem acesso",c:"bad"};
  if(a.inicio&&a.inicio>TODAY) return {t:"Começa em "+fmtDate(a.inicio),c:""};
  if(!a.expira) return {t:"Sem prazo",c:""};
  const n=daysLeft(a.expira);
  if(n<0) return {t:`Expirou há ${-n} dia${-n>1?"s":""}`,c:"bad"};
  if(n===0) return {t:"Expira hoje",c:"warn"};
  if(n===1) return {t:"Expira amanhã",c:"warn"};
  return {t:`Faltam ${n} dias`,c:n<=7?"warn":""};
}
function copyText(t,okMsg){try{navigator.clipboard.writeText(t).then(()=>toast(okMsg||"Copiado"),()=>toast("Não foi possível copiar"))}catch{toast("Não foi possível copiar")}}
const AUTH_ERR={
  "auth/email-already-in-use":"Já existe uma conta com este e-mail. Use Entrar.",
  "auth/invalid-email":"E-mail inválido.",
  "auth/weak-password":"A senha precisa ter pelo menos 6 caracteres.",
  "auth/invalid-credential":"E-mail ou senha incorretos.",
  "auth/wrong-password":"E-mail ou senha incorretos.",
  "auth/user-not-found":"E-mail ou senha incorretos.",
  "auth/too-many-requests":"Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  "auth/network-request-failed":"Sem conexão com a internet.",
  "auth/requires-recent-login":"Por segurança, saia e entre de novo antes de fazer isso.",
  "auth/missing-password":"Digite a senha."
};
const authMsg=e=>AUTH_ERR[e?.code]||"Não foi possível concluir. Tente de novo.";

/* ================= estado ================= */
const S = {tasks:[], groups:[], tab:"pendentes", page:"tarefas", g:"", sub:"", editing:null, foto:null, prio:"media", ready:false,
  role:"loading", user:null, acc:null, myPedido:null, acessos:[], pedidos:[], backups:[], publico:false, showGate:false, authTab:"entrar"};
const AG_DEF={nome:NOME_PADRAO||"Minha Agenda",prioPadrao:"media",valores:true};
const AG={...AG_DEF};
const LP={tema:"auto",pagina:"tarefas",aba:"pendentes"};
try{Object.assign(LP,JSON.parse(localStorage.getItem("agenda.prefs")||"{}"))}catch{}
S.tab=LP.aba||"pendentes";
S.page=({painel:"painel",configuracoes:"config",config:"config",tarefas:"tarefas"})[location.hash.slice(1)]||LP.pagina||"tarefas";
function applyTheme(){const r=document.documentElement;LP.tema==="auto"?r.removeAttribute("data-theme"):r.setAttribute("data-theme",LP.tema)}
applyTheme();

const isOwner=()=>S.role==="owner";
const isMember=()=>S.role==="ver"||S.role==="editar";
const canWrite=()=>S.role==="owner"||S.role==="editar";
const canRead=()=>isOwner()||isMember()||S.publico;
const visitor=()=>S.role==="none";
const verified=()=>!!S.user&&S.user.emailVerified;

/* ================= Firebase ================= */
let app=null, auth=null, fs=null;
if(CONFIGURADO){
  app=initializeApp(firebaseConfig);
  auth=getAuth(app);
  try{fs=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
  catch{fs=getFirestore(app)}
}
const seg=p=>p.split("/");
// Pequena camada no formato que a agenda já usava
const db={
  collection(p){const ref=collection(fs,...seg(p));return{
    add:d=>addDoc(ref,d),
    onSnapshot:(ok,err)=>onSnapshot(ref,s=>ok({docs:s.docs.map(d=>({id:d.id,data:()=>d.data()}))}),err)}},
  doc(p){const ref=doc(fs,...seg(p));return{
    set:d=>setDoc(ref,d), update:d=>updateDoc(ref,d), delete:()=>deleteDoc(ref),
    get:async()=>{const s=await getDoc(ref);return{exists:s.exists(),data:()=>s.data()}},
    onSnapshot:(ok,err)=>onSnapshot(ref,s=>ok({exists:s.exists(),data:()=>s.data()}),err)}}
};
async function batchRun(ops){ // ops: [{t:"set"|"del", p:path, d}]
  for(let i=0;i<ops.length;i+=400){
    const b=writeBatch(fs);
    for(const o of ops.slice(i,i+400)){const r=doc(fs,...seg(o.p));o.t==="del"?b.delete(r):b.set(r,o.d)}
    await b.commit();
  }
}
function fail(err){console.error(err);toast(err?.code==="permission-denied"?"Sem permissão para isso.":err?.code==="unavailable"?"Sem conexão: será salvo quando a internet voltar.":"Não foi possível salvar. Tente de novo.")}

/* ================= fotos (guardadas no Firestore, compactadas) ================= */
const fotoCache=new Map();
function fotoURL(id){
  if(!fotoCache.has(id)) fotoCache.set(id,getDoc(doc(fs,"fotos",id)).then(s=>s.exists()?s.data().data:"").catch(()=>""));
  return fotoCache.get(id);
}
function hydratePhotos(root){(root||document).querySelectorAll("img[data-foto]").forEach(async img=>{const id=img.dataset.foto;if(img.dataset.done===id)return;img.dataset.done=id;img.src=await fotoURL(id)||""})}
async function shrink(file,max,q){
  const bmp=await createImageBitmap(file);
  const k=Math.min(1,max/Math.max(bmp.width,bmp.height));
  const c=document.createElement("canvas");c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
  c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",q);
}
const fotos={
  async upload(file){
    let url=await shrink(file,1280,.75);
    if(url.length>700000) url=await shrink(file,900,.6);
    if(url.length>900000) throw {code:"too_large"};
    const r=await addDoc(collection(fs,"fotos"),{data:url,criadoEm:new Date().toISOString()});
    fotoCache.set(r.id,Promise.resolve(url));
    return r.id;
  },
  delete(id){fotoCache.delete(id);return deleteDoc(doc(fs,"fotos",id))}
};

/* ================= e-mail (EmailJS, opcional) ================= */
const emailOn=()=>!!(EMAILJS&&EMAILJS.publicKey&&EMAILJS.serviceId&&EMAILJS.templateId);
let ejsP=null;
function loadEmailJS(){
  if(ejsP) return ejsP;
  ejsP=new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload=()=>{try{window.emailjs.init({publicKey:EMAILJS.publicKey});ok(window.emailjs)}catch(e){ko(e)}};s.onerror=ko;document.head.appendChild(s)});
  return ejsP;
}
async function sendEmail(to,subject,message){
  if(!emailOn()) return false;
  try{const ej=await loadEmailJS();await ej.send(EMAILJS.serviceId,EMAILJS.templateId,{to_email:to,subject,message,reply_to:to===DONO?(S.user?.email||""):DONO});return true}
  catch(e){console.warn("EmailJS",e);return false}
}

/* ================= tarefas: render ================= */
$("#today").textContent=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});
function gName(id){return S.groups.find(g=>g.id===id)?.nome||""}
function isLate(t){return !t.concluida&&t.prazo&&t.prazo<TODAY}
function needAttr(id,kind){return canWrite()?`data-${kind}="${id}"`:visitor()?'data-need="1"':"disabled"}
function render(){
  const pend=S.tasks.filter(t=>!t.concluida);
  $("#sPend").textContent=S.ready?pend.length:"–";
  $("#sHoje").textContent=S.ready?pend.filter(t=>t.prazo===TODAY).length:"–";
  $("#sLate").textContent=S.ready?pend.filter(isLate).length:"–";
  $("#sVal").textContent=S.ready?brl.format(pend.reduce((a,t)=>a+(t.valor||0),0)):"–";
  $("#sVal").parentElement.hidden=!AG.valores; $(".stats").classList.toggle("noval",!AG.valores);
  $("#cPend").textContent=S.ready?pend.length:"";
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===S.tab));
  $("#groupChips").innerHTML=`<button class="chip" data-g="" aria-pressed="${!S.g}">Todos</button>`+
    S.groups.map(g=>`<button class="chip" data-g="${g.id}" aria-pressed="${S.g===g.id}">${esc(g.nome)}</button>`).join("");
  const grp=S.groups.find(g=>g.id===S.g), sc=$("#subChips");
  sc.hidden=!grp||!(grp.subgrupos||[]).length;
  if(grp) sc.innerHTML=`<button class="chip" data-s="" aria-pressed="${!S.sub}">Todos</button>`+(grp.subgrupos||[]).map(s=>`<button class="chip" data-s="${esc(s)}" aria-pressed="${S.sub===s}">${esc(s)}</button>`).join("");
  $("#ctx").textContent=grp&&canWrite()?`Adicionando em ${grp.nome}${S.sub?" › "+S.sub:""}`:"";
  const list=$("#list");
  if(!S.ready){list.innerHTML=`<div class="empty"><strong>Carregando sua agenda…</strong>Suas tarefas aparecem aqui.</div>`;return}
  if(S.dataErr){list.innerHTML=`<div class="empty"><strong>Agenda protegida</strong>Entre com sua conta liberada para ver as tarefas.</div>`;return}
  let rows=S.tasks.filter(t=>(!S.g||t.grupo===S.g)&&(!S.sub||t.subgrupo===S.sub));
  rows=rows.filter(t=>({pendentes:!t.concluida,hoje:!t.concluida&&t.prazo&&t.prazo<=TODAY,atrasadas:isLate(t),concluidas:t.concluida,todas:true})[S.tab]);
  rows.sort((a,b)=>S.tab==="concluidas"?(b.concluidaEm||"").localeCompare(a.concluidaEm||""):
    (a.concluida-b.concluida)||(a.prazo||"9999").localeCompare(b.prazo||"9999")||PRIO[a.prioridade||"media"].o-PRIO[b.prioridade||"media"].o);
  if(!rows.length){
    const msg={pendentes:["Nada pendente aqui","Digite uma tarefa no campo acima e toque em Adicionar."],hoje:["Dia livre","Nenhuma tarefa com prazo para hoje."],atrasadas:["Tudo em dia","Nenhuma tarefa atrasada."],concluidas:["Nenhuma concluída ainda","Toque no círculo de uma tarefa para concluí-la."],todas:["Agenda vazia","Comece pelo campo acima. Use + para incluir foto, valor, prazo e repetição."]}[S.tab];
    list.innerHTML=`<div class="empty"><strong>${msg[0]}</strong>${msg[1]}</div>`;return;
  }
  list.innerHTML=rows.map(t=>{
    const p=PRIO[t.prioridade||"media"], g=gName(t.grupo);
    const due=t.prazo?`<span class="due ${isLate(t)?"late":t.prazo===TODAY&&!t.concluida?"hoje":""}">${isLate(t)?"Atrasada · ":""}${fmtDue(t.prazo)}</span>`:"";
    return `<article class="task ${t.concluida?"done":""}" style="--pc:${p.c}">
      <button class="check" ${needAttr(t.id,"check")} aria-label="${t.concluida?"Reabrir":"Concluir"} ${esc(t.titulo)}"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 8.5l3.2 3L13 4.5"/></svg></button>
      <button class="t-main" ${needAttr(t.id,"edit")} style="color:inherit">
        <div class="t-title">${esc(t.titulo)}</div>
        ${t.descricao?`<div class="t-desc">${esc(t.descricao)}</div>`:""}
        <div class="meta"><span class="pill">${p.n}</span>${due}
          ${t.recorrencia?`<span title="Repete">↻ ${REC[t.recorrencia]}</span>`:""}
          ${t.executor?`<span>Por: ${esc(t.executor)}</span>`:""}
          ${t.valor&&AG.valores?`<span class="money">${brl.format(t.valor)}</span>`:""}
          ${g?`<span class="grp">${esc(g)}${t.subgrupo?" › "+esc(t.subgrupo):""}</span>`:""}</div>
      </button>
      ${t.foto?`<button class="thumb" data-img="${t.foto}" aria-label="Ver foto"><img class="thumb" data-foto="${t.foto}" alt="" loading="lazy"></button>`:"<span></span>"}
    </article>`}).join("");
  hydratePhotos(list);
}

/* ================= eventos gerais ================= */
document.addEventListener("click",async e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.close!==undefined){b.closest("dialog").close();return}
  if(b.dataset.need){needAccount();return}
  if(b.dataset.page){go(b.dataset.page);return}
  if(b.dataset.tab){S.tab=b.dataset.tab;render();return}
  if(b.dataset.go){S.tab=b.dataset.go;S.page!=="tarefas"?go("tarefas"):render();return}
  if(b.dataset.g!==undefined){S.g=b.dataset.g;S.sub="";render();return}
  if(b.dataset.s!==undefined){S.sub=b.dataset.s;render();return}
  if(b.dataset.check){toggleDone(b.dataset.check);return}
  if(b.dataset.edit){openEditor(S.tasks.find(t=>t.id===b.dataset.edit));return}
  if(b.dataset.img){$("#bigImg").src=await fotoURL(b.dataset.img);$("#dlgImg").showModal();return}
  if(b.dataset.p){setPrio(b.dataset.p);return}
});
function needAccount(){toast(!S.user?"Crie sua conta ou entre para cadastrar":!verified()?"Confirme seu e-mail primeiro":S.myPedido?"Sua conta aguarda liberação":"Peça a liberação para cadastrar");openGate()}

$("#quick").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!canWrite()){if(visitor())needAccount();return}
  const v=$("#quickInput").value.trim(); if(!v){openEditor(null);return}
  const t={titulo:v,prioridade:AG.prioPadrao||"media",concluida:false,grupo:S.g||"",subgrupo:S.sub||"",prazo:S.tab==="hoje"?TODAY:"",criadoEm:new Date().toISOString()};
  $("#quickInput").value="";
  try{await db.collection("tarefas").add(t);toast("Tarefa adicionada")}catch(err){fail(err)}
});
$("#btnMore").onclick=()=>canWrite()?openEditor(null,$("#quickInput").value.trim()):visitor()&&needAccount();

async function toggleDone(id){
  const t=S.tasks.find(x=>x.id===id); if(!t) return;
  try{
    if(!t.concluida){
      await db.doc("tarefas/"+id).update({concluida:true,concluidaEm:new Date().toISOString()});
      if(t.recorrencia&&t.prazo&&!t.proximaCriada){
        const {id:_,...rest}=t;
        await db.collection("tarefas").add({...rest,prazo:nextDate(t.prazo,t.recorrencia),concluida:false,concluidaEm:null,proximaCriada:false,criadoEm:new Date().toISOString()});
        await db.doc("tarefas/"+id).update({proximaCriada:true});
        toast("Concluída · próxima em "+fmtDue(nextDate(t.prazo,t.recorrencia)));
      } else toast("Concluída");
    } else await db.doc("tarefas/"+id).update({concluida:false,concluidaEm:null});
  }catch(err){fail(err)}
}

/* ================= editor ================= */
function setPrio(p){S.prio=p;document.querySelectorAll("#fPrio button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.p===p))}
function fillGroupSelect(gid,sub){
  $("#fGrupo").innerHTML=`<option value="">Sem grupo</option>`+S.groups.map(g=>`<option value="${g.id}">${esc(g.nome)}</option>`).join("");
  $("#fGrupo").value=gid||""; fillSub(sub);
}
function fillSub(sub){
  const g=S.groups.find(x=>x.id===$("#fGrupo").value);
  $("#fSub").innerHTML=`<option value="">—</option>`+(g?.subgrupos||[]).map(s=>`<option>${esc(s)}</option>`).join("");
  $("#fSub").value=sub||"";
}
$("#fGrupo").onchange=()=>fillSub("");
$("#fRec").onchange=()=>$("#recNote").hidden=!$("#fRec").value;
async function showPhoto(id){S.foto=id;$("#fFotoPrev").hidden=!id;if(id)$("#fFotoPrev").src=await fotoURL(id);$("#fFotoDel").hidden=!id;$("#fFotoLbl").textContent=id?"Trocar foto":"Adicionar foto"}
function openEditor(t,prefill){
  S.editing=t?.id||null;
  $("#formTitle").textContent=t?"Editar tarefa":"Nova tarefa";
  $("#fTitulo").value=t?.titulo||prefill||"";
  $("#fDesc").value=t?.descricao||"";
  $("#fPrazo").value=t?.prazo||"";
  $("#fRec").value=t?.recorrencia||""; $("#recNote").hidden=!$("#fRec").value;
  $("#fExec").value=t?.executor||"";
  $("#fValor").value=t?.valor?String(t.valor.toFixed(2)).replace(".",","):"";
  $("#fDone").checked=!!t?.concluida;
  setPrio(t?.prioridade||AG.prioPadrao||"media");
  fillGroupSelect(t?t.grupo:S.g,t?t.subgrupo:S.sub);
  showPhoto(t?.foto||null);
  $("#execList").innerHTML=[...new Set(S.tasks.map(x=>x.executor).filter(Boolean))].map(x=>`<option value="${esc(x)}">`).join("");
  $("#btnDel").hidden=!t; $("#delConfirm").hidden=true;
  $("#dlg").showModal();
  if(!t) setTimeout(()=>$("#fTitulo").focus(),50);
}
$("#fFoto").onchange=async e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  $("#fFotoLbl").textContent="Enviando…";
  try{showPhoto(await fotos.upload(f))}
  catch(err){showPhoto(S.foto);toast(err?.code==="too_large"?"Foto grande demais":"Não foi possível enviar a foto")}
};
$("#fFotoDel").onclick=()=>showPhoto(null);
$("#form").addEventListener("submit",async e=>{
  e.preventDefault();
  const old=S.tasks.find(x=>x.id===S.editing);
  const data={titulo:$("#fTitulo").value.trim(),descricao:$("#fDesc").value.trim(),prioridade:S.prio,
    prazo:$("#fPrazo").value,recorrencia:$("#fRec").value,executor:$("#fExec").value.trim(),
    valor:parseMoney($("#fValor").value),grupo:$("#fGrupo").value,subgrupo:$("#fSub").value,foto:S.foto||null};
  if(!data.titulo) return;
  const nowDone=$("#fDone").checked; $("#btnSave").disabled=true;
  try{
    if(old){
      await db.doc("tarefas/"+old.id).update({...data,concluida:old.concluida});
      if(nowDone!==!!old.concluida){Object.assign(old,data);await toggleDone(old.id)} else toast("Salvo");
      if(old.foto&&old.foto!==data.foto&&!S.tasks.some(x=>x.id!==old.id&&x.foto===old.foto)) fotos.delete(old.foto).catch(()=>{});
    } else {
      await db.collection("tarefas").add({...data,concluida:nowDone,concluidaEm:nowDone?new Date().toISOString():null,criadoEm:new Date().toISOString()});
      toast("Tarefa adicionada"); $("#quickInput").value="";
    }
    $("#dlg").close();
  }catch(err){fail(err)} finally{$("#btnSave").disabled=false}
});
$("#btnDel").onclick=()=>$("#delConfirm").hidden=false;
$("#delNo").onclick=()=>$("#delConfirm").hidden=true;
$("#delYes").onclick=async()=>{
  const t=S.tasks.find(x=>x.id===S.editing); if(!t) return;
  try{await db.doc("tarefas/"+t.id).delete();
    if(t.foto&&!S.tasks.some(x=>x.id!==t.id&&x.foto===t.foto)) fotos.delete(t.foto).catch(()=>{});
    $("#dlg").close(); toast("Tarefa excluída")}catch(err){fail(err)}
};

/* ================= grupos ================= */
function renderGroups(){
  $("#gList").innerHTML=S.groups.length?S.groups.map(g=>`<div class="gblock">
    <div class="gname">${esc(g.nome)}<button class="ghost" data-gdel="${g.id}">Excluir grupo</button></div>
    <div class="subs">${(g.subgrupos||[]).map((s,i)=>`<span>${esc(s)}<button data-sdel="${g.id}|${i}" aria-label="Remover ${esc(s)}">×</button></span>`).join("")||'<span class="note">Sem subgrupos</span>'}</div>
    <form class="inline" data-sadd="${g.id}"><input placeholder="Novo subgrupo" aria-label="Novo subgrupo em ${esc(g.nome)}"><button class="btn sec" type="submit">Adicionar</button></form>
    <div class="confirm" data-gconf="${g.id}" hidden>Excluir “${esc(g.nome)}”? As tarefas ficam sem grupo. <button type="button" class="btn danger" data-gyes="${g.id}">Excluir</button><button type="button" class="ghost" data-gno="${g.id}">Cancelar</button></div>
  </div>`).join(""):`<div class="empty"><strong>Nenhum grupo</strong>Crie o primeiro abaixo.</div>`;
}
const openGroups=()=>{renderGroups();$("#dlgG").showModal()};
$("#btnGroups").onclick=openGroups;
$("#gAdd").addEventListener("submit",async e=>{
  e.preventDefault(); const n=$("#gNew").value.trim(); if(!n) return;
  try{await db.collection("grupos").add({nome:n,subgrupos:[],ordem:S.groups.length});$("#gNew").value=""}catch(err){fail(err)}
});
$("#gList").addEventListener("submit",async e=>{
  e.preventDefault(); const id=e.target.dataset.sadd, inp=e.target.querySelector("input"), v=inp.value.trim();
  const g=S.groups.find(x=>x.id===id); if(!v||!g) return;
  if((g.subgrupos||[]).includes(v)) return toast("Esse subgrupo já existe");
  try{await db.doc("grupos/"+id).update({subgrupos:[...(g.subgrupos||[]),v]});inp.value=""}catch(err){fail(err)}
});
$("#gList").addEventListener("click",async e=>{
  const b=e.target.closest("button"); if(!b) return; const conf=id=>$(`[data-gconf="${id}"]`);
  if(b.dataset.gdel) conf(b.dataset.gdel).hidden=false;
  if(b.dataset.gno) conf(b.dataset.gno).hidden=true;
  if(b.dataset.gyes){try{await db.doc("grupos/"+b.dataset.gyes).delete();if(S.g===b.dataset.gyes){S.g="";S.sub=""}}catch(err){fail(err)}}
  if(b.dataset.sdel){const [id,i]=b.dataset.sdel.split("|");const g=S.groups.find(x=>x.id===id);const subs=[...g.subgrupos];subs.splice(+i,1);
    try{await db.doc("grupos/"+id).update({subgrupos:subs})}catch(err){fail(err)}}
});

/* ================= tela geral ================= */
function go(p){S.page=p;renderAll();window.scrollTo(0,0)}
function openGate(){S.showGate=true;renderAll();window.scrollTo(0,0)}
// Qual tela de entrada mostrar (ou null para mostrar a agenda)
function gateMode(){
  if(!CONFIGURADO) return "setup";
  if(S.role==="loading") return null;
  if(!S.user) return (S.showGate||!S.publico)?"auth":null;
  if(!verified()) return "verify";
  if(isOwner()||isMember()) return null;
  return (S.showGate||!S.publico)?"pedido":null;
}
function renderAll(){
  const r=S.role, gm=gateMode(), off=!!gm;
  document.body.classList.toggle("ro",r!=="loading"&&!canWrite()&&!visitor());
  $("#btnAcc").hidden=r!=="owner"; $("#btnGroups").hidden=r!=="owner";
  $("#app").hidden=off||S.page!=="tarefas";
  $("#pgPainel").hidden=off||S.page!=="painel";
  $("#pgConfig").hidden=off||S.page!=="config";
  $("#pnav").hidden=off;
  document.querySelectorAll("#pnav button").forEach(b=>b.dataset.page===S.page?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));
  $("#h1").textContent=off?(AG.nome||"Minha Agenda"):{tarefas:AG.nome||"Minha Agenda",painel:"Painel",config:"Configurações"}[S.page];
  document.title=AG.nome||"Minha Agenda";
  renderGate(gm); renderBanner(gm); render();
  if(!off&&S.page==="painel") renderPainel();
  if(!off&&S.page==="config") syncConfig();
  if($("#dlgA").open) renderAcc();
  if($("#dlgG").open) renderGroups();
}
function renderBanner(gm){
  const b=$("#accBanner"); b.className="banner"; b.hidden=true;
  if(gm) return;
  if(isOwner()){
    const ped=S.pedidos.length, venc=S.acessos.filter(a=>a.expira&&daysLeft(a.expira)<3).length, n=ped+venc;
    $("#accBadge").hidden=!n; $("#accBadge").textContent=n;
    if(!n) return;
    const parts=[]; if(ped) parts.push(`${ped} pedido${ped>1?"s":""} de acesso aguardando`); if(venc) parts.push(`${venc} acesso${venc>1?"s":""} vencendo ou vencido${venc>1?"s":""}`);
    b.innerHTML=`<span>${parts.join(" · ")}</span><button class="btn" type="button" id="bannerOpen">Ver acessos</button>`;
    if(venc&&!ped) b.classList.add("warn"); b.hidden=false; $("#bannerOpen").onclick=openAcc; return;
  }
  if(isMember()){const li=leftInfo(S.acc);b.innerHTML=`<span>Seu acesso: <b>${li.t}</b></span>`;if(li.c)b.classList.add(li.c==="bad"?"bad":"warn");if(S.acc?.expira&&daysLeft(S.acc.expira)<=1)b.classList.add("bad");b.hidden=false;return}
  if(visitor()){
    let txt,btn;
    if(!S.user){txt="Você está só visualizando. Para cadastrar tarefas, crie sua conta com e-mail e senha.";btn="Criar conta / Entrar"}
    else if(S.myPedido){txt=`Conta criada. Aguardando liberação de ${DONO}. Por enquanto você só pode visualizar.`;btn="Ver pedido"}
    else if(S.acc&&S.acc.expira&&S.acc.expira<TODAY){txt="Seu acesso expirou. Você pode visualizar, mas para cadastrar peça a renovação.";btn="Pedir renovação"}
    else{txt="Sua conta ainda não foi liberada para cadastrar.";btn="Pedir liberação"}
    b.innerHTML=`<span>${txt}</span><button class="btn" type="button" id="bannerGate">${btn}</button>`;
    b.classList.add("warn"); b.hidden=false; $("#bannerGate").onclick=openGate;
  }
}

/* ================= telas de entrada ================= */
let gateKey="";
function passFields(){return `<div class="row">
  <div class="field"><label for="lPass">Crie uma senha</label><input type="password" id="lPass" minlength="6" required autocomplete="new-password"></div>
  <div class="field"><label for="lPass2">Repita a senha</label><input type="password" id="lPass2" minlength="6" required autocomplete="new-password"></div></div>`}
function pedidoEmail(p){
  return `Olá! Criei minha conta na agenda "${AG.nome}" e peço a liberação de acesso.\n\nNome: ${p.nome||""}\nE-mail: ${p.email}${p.msg?"\nMensagem: "+p.msg:""}\nPedido feito em: ${fmtDT(p.quando)}\n\nPara liberar, abra a agenda e toque em Acessos.\n${location.href.split("#")[0]}`;
}
async function enviarPedido(nome,msg,renovacao){
  const p={uid:S.user.uid,email:S.user.email.toLowerCase(),nome,msg,quando:new Date().toISOString(),renovacao:!!renovacao};
  await db.doc("pedidos/"+S.user.uid).set(p);
  const ok=await sendEmail(DONO,`Pedido de liberação: ${AG.nome}`,pedidoEmail(p));
  if(ok) await db.doc("pedidos/"+S.user.uid).update({avisado:true}).catch(()=>{});
}
function renderGate(gm){
  const g=$("#gate");
  $("#gateBack").hidden=!(gm&&S.publico&&gm!=="setup"&&gm!=="verify");
  if(!gm){g.hidden=true;gateKey="";return}
  g.hidden=false;
  const key=gm+"|"+S.authTab+"|"+(S.myPedido?.quando||"")+"|"+(S.acc?.expira||"")+"|"+(S.user?.uid||"");
  if(gateKey===key) return; gateKey=key;

  if(gm==="setup"){g.innerHTML=`<h2>Falta configurar</h2><p>Abra o arquivo <b>config.js</b> e cole as chaves do seu projeto Firebase, como explica o passo a passo.</p>`;return}

  if(gm==="auth"){
    const tab=S.authTab;
    g.innerHTML=`<div class="plans" id="aTabs" style="grid-template-columns:1fr 1fr"><button type="button" data-at="entrar" aria-pressed="${tab==="entrar"}">Entrar</button><button type="button" data-at="criar" aria-pressed="${tab==="criar"}">Criar conta</button></div>`+
    (tab==="entrar"?`<h2>Entrar</h2><p>Use o e-mail e a senha da sua conta.</p>
      <form class="stack" id="aForm" style="gap:12px">
        <div class="field"><label for="lEmail">E-mail</label><input type="email" id="lEmail" required autocomplete="username"></div>
        <div class="field"><label for="lPassIn">Senha</label><input type="password" id="lPassIn" required autocomplete="current-password"></div>
        <label class="toggle"><input type="checkbox" id="lKeep" checked> Manter conectado neste aparelho</label>
        <div class="err" id="aErr"></div>
        <div class="actions"><button type="button" class="ghost" id="aForgot">Esqueci a senha</button><div class="r"><button class="btn" type="submit" id="aBtn">Entrar</button></div></div>
      </form>`
    :`<h2>Criar conta de acesso</h2><p>Para cadastrar e editar tarefas, crie sua conta com e-mail e senha. Você vai receber um e-mail para confirmar o endereço, e o pedido de liberação vai para <b>${esc(DONO)}</b>, que define o período de uso.</p>
      <form class="stack" id="aForm" autocomplete="off" style="gap:12px">
        <div class="field"><label for="cNomeU">Seu nome</label><input id="cNomeU" required autocomplete="name"></div>
        <div class="field"><label for="lEmail">E-mail</label><input type="email" id="lEmail" required autocomplete="username"></div>
        ${passFields()}
        <div class="field"><label for="pMsg">Mensagem (opcional)</label><input id="pMsg" placeholder="Ex.: sou a Maria, vou cuidar das consultas"></div>
        <div class="err" id="aErr"></div>
        <div><button class="btn" type="submit" id="aBtn">Criar conta e pedir liberação</button></div>
      </form>`);
    $("#aTabs").onclick=e=>{const b=e.target.closest("button");if(b){S.authTab=b.dataset.at;gateKey="";renderAll()}};
    if(tab==="entrar"){
      $("#aForgot").onclick=async()=>{const em=$("#lEmail").value.trim();if(!em){$("#aErr").textContent="Digite seu e-mail acima e toque de novo em Esqueci a senha.";return}
        try{await sendPasswordResetEmail(auth,em);$("#aErr").textContent="";toast("Enviamos um link para criar nova senha")}catch(x){$("#aErr").textContent=authMsg(x)}};
      $("#aForm").onsubmit=async e=>{e.preventDefault();$("#aErr").textContent="";$("#aBtn").disabled=true;
        try{await setPersistence(auth,$("#lKeep").checked?browserLocalPersistence:browserSessionPersistence);
          await signInWithEmailAndPassword(auth,$("#lEmail").value.trim(),$("#lPassIn").value);S.showGate=false}
        catch(x){$("#aErr").textContent=authMsg(x)} finally{const b=$("#aBtn");if(b)b.disabled=false}};
    } else {
      $("#aForm").onsubmit=async e=>{e.preventDefault();const err=$("#aErr");err.textContent="";
        const nome=$("#cNomeU").value.trim(), em=$("#lEmail").value.trim(), p=$("#lPass").value, msg=$("#pMsg").value.trim();
        if(p.length<6){err.textContent="A senha precisa ter pelo menos 6 caracteres.";return}
        if(p!==$("#lPass2").value){err.textContent="As senhas não conferem.";return}
        $("#aBtn").disabled=true;
        try{
          await setPersistence(auth,browserLocalPersistence);
          const cred=await createUserWithEmailAndPassword(auth,em,p);
          await updateProfile(cred.user,{displayName:nome}).catch(()=>{});
          await sendEmailVerification(cred.user).catch(()=>{});
          S.user=cred.user;
          if(em.toLowerCase()!==DONO) await enviarPedido(nome,msg,false).catch(()=>{});
          toast("Conta criada. Confira seu e-mail.");
        }catch(x){const e2=$("#aErr");if(e2)e2.textContent=authMsg(x);else toast(authMsg(x))} finally{const b=$("#aBtn");if(b)b.disabled=false}};
    }
    return;
  }

  if(gm==="verify"){
    g.innerHTML=`<h2>Confirme seu e-mail</h2><p>Enviamos um link de confirmação para <b>${esc(S.user.email)}</b>. Abra o e-mail (veja também o spam), toque no link e depois volte aqui.</p>
      <div class="err" id="vErr"></div>
      <div class="actions"><button type="button" class="ghost" id="vOut">Sair</button><div class="r"><button type="button" class="btn sec" id="vSend">Reenviar e-mail</button><button type="button" class="btn" id="vOk">Já confirmei</button></div></div>`;
    $("#vOut").onclick=()=>signOut(auth);
    $("#vSend").onclick=async()=>{try{await sendEmailVerification(S.user);toast("E-mail reenviado")}catch(x){$("#vErr").textContent=authMsg(x)}};
    $("#vOk").onclick=async()=>{try{await S.user.reload();await S.user.getIdToken(true);if(!S.user.emailVerified){$("#vErr").textContent="Ainda não aparece como confirmado. Toque no link do e-mail e tente de novo.";return}gateKey="";onUser(S.user)}catch(x){$("#vErr").textContent=authMsg(x)}};
    return;
  }

  // gm==="pedido": conta confirmada, sem acesso ativo
  const a=S.acc, out=`<button class="ghost" type="button" id="pOut">Sair da conta</button>`;
  if(S.myPedido){
    const p=S.myPedido, corpo=pedidoEmail(p);
    const mail=`mailto:${DONO}?subject=${encodeURIComponent("Pedido de liberação: "+AG.nome)}&body=${encodeURIComponent(corpo)}`;
    g.innerHTML=`<h2>Aguardando liberação</h2><p>Pedido enviado em ${fmtDT(p.quando)} com o e-mail <b>${esc(p.email)}</b>. ${p.avisado?`Avisamos <b>${esc(DONO)}</b> por e-mail.`:`O pedido vai para <b>${esc(DONO)}</b>.`} Assim que for liberado, a agenda abre sozinha.</p>
      <div class="who"><b>Quer agilizar?</b> Envie também um e-mail para <span style="user-select:all;font-weight:600">${esc(DONO)}</span>.
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><a class="btn" href="${mail}" style="text-decoration:none">Abrir e-mail</a><button class="btn sec" type="button" id="pedCopy">Copiar pedido</button></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="ghost" type="button" id="pedCancel">Cancelar pedido</button>${out}</div>`;
    $("#pedCopy").onclick=()=>copyText("Para: "+DONO+"\n\n"+corpo,"Pedido copiado");
    $("#pedCancel").onclick=async()=>{try{await db.doc("pedidos/"+S.user.uid).delete()}catch(err){fail(err)}};
    $("#pOut").onclick=()=>signOut(auth); return;
  }
  if(a&&a.inicio&&a.inicio>TODAY){g.innerHTML=`<h2>Acesso agendado</h2><p>Seu acesso começa em ${fmtDate(a.inicio)}.</p>${out}`;$("#pOut").onclick=()=>signOut(auth);return}
  g.innerHTML=`<h2>${a?"Pedir renovação":"Pedir liberação"}</h2><p>${a?"Seu acesso expirou.":"Sua conta está confirmada."} Envie o pedido para <b>${esc(DONO)}</b>.</p>
    <form class="stack" id="pedForm" style="gap:12px">
      <div class="field"><label for="pNome">Seu nome</label><input id="pNome" required></div>
      <div class="field"><label for="pMsg2">Mensagem (opcional)</label><input id="pMsg2"></div>
      <div class="err" id="pErr"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit" id="pBtn">Enviar pedido</button>${out}</div></form>`;
  $("#pNome").value=S.user.displayName||a?.nome||"";
  $("#pOut").onclick=()=>signOut(auth);
  $("#pedForm").onsubmit=async e=>{e.preventDefault();$("#pBtn").disabled=true;
    try{await enviarPedido($("#pNome").value.trim(),$("#pMsg2").value.trim(),!!a)}catch(err){$("#pErr").textContent="Não foi possível enviar. Tente de novo."}
    finally{const b=$("#pBtn");if(b)b.disabled=false}};
}
$("#gBack").onclick=()=>{S.showGate=false;renderAll();window.scrollTo(0,0)};

/* ================= acessos (dono) ================= */
let grant={nivel:"editar",plano:"mensal",uid:null,email:"",nome:""};
function openAcc(){renderAcc();$("#dlgA").showModal()}
$("#btnAcc").onclick=openAcc;
function renderAcc(){
  $("#pedTitle").hidden=!S.pedidos.length;
  $("#pedList").innerHTML=S.pedidos.map(p=>`<div class="acc">
    <span class="em">${esc(p.email)}</span><span class="left">${p.renovacao?"Renovação":"Novo"}</span>
    <span class="sub">${p.nome?esc(p.nome)+" · ":""}${fmtDT(p.quando)}${p.msg?"<br>“"+esc(p.msg)+"”":""}</span>
    <div class="ops"><button class="btn" type="button" data-pok="${p.id}">Liberar</button><button class="ghost" type="button" data-pno="${p.id}">Recusar</button></div></div>`).join("");
  const rows=[...S.acessos].sort((a,b)=>(a.expira||"9999").localeCompare(b.expira||"9999"));
  $("#accList").innerHTML=rows.length?rows.map(a=>{const li=leftInfo(a);return `<div class="acc">
    <span class="em">${esc(a.email)}</span><span class="left ${li.c}">${li.t}</span>
    <span class="sub">${a.nome?esc(a.nome)+" · ":""}${NIVEL[a.nivel]||""} · ${PLANOS[a.plano]||""}${a.plano==="dias"&&a.dias?" ("+a.dias+")":""} · ${a.inicio?fmtDate(a.inicio):""}${a.expira?" até "+fmtDate(a.expira):" sem data de término"}</span>
    <div class="ops"><button class="btn sec" type="button" data-aren="${a.id}">Renovar</button><button class="ghost" type="button" data-aniv="${a.id}">Mudar para ${a.nivel==="editar"?"só ver":"ver e editar"}</button><button class="ghost" type="button" data-arev="${a.id}" style="color:var(--late)">Revogar</button></div>
    <div class="confirm" data-aconf="${a.id}" hidden style="grid-column:1/-1">Revogar o acesso de ${esc(a.email)}? <button type="button" class="btn danger" data-ayes="${a.id}">Revogar</button><button type="button" class="ghost" data-ano="${a.id}">Cancelar</button></div>
  </div>`}).join(""):`<div class="empty"><strong>Ninguém além de você</strong>Quando alguém criar uma conta, o pedido aparece acima.</div>`;
  renderGrant();
}
function grantRange(){
  const ex=S.acessos.find(a=>a.id===grant.uid);
  let ini=TODAY;
  if(ex&&ex.expira&&ex.expira>=TODAY&&grant.plano!=="periodo") ini=addDays(ex.expira,1);
  const p=grant.plano;
  if(p==="periodo") return {ini:$("#gDe").value,fim:$("#gAte").value,ext:false};
  if(p==="sempre") return {ini,fim:null,ext:false};
  if(p==="dias"){const n=parseInt($("#gDias").value,10);return n>0?{ini,fim:addDays(ini,n-1),ext:ini!==TODAY}:null}
  const m={mensal:1,semestral:6,anual:12}[p];
  return {ini,fim:addDays(addMonths(ini,m),-1),ext:ini!==TODAY};
}
function renderGrant(){
  $("#grantForm").hidden=!grant.uid; $("#grantHint").hidden=!!grant.uid;
  $("#gEmail").value=grant.email; $("#gNome").value=$("#gNome").value||grant.nome;
  document.querySelectorAll("#gNivel button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.n===grant.nivel));
  document.querySelectorAll("#gPlano button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.pl===grant.plano));
  $("#gDiasWrap").hidden=grant.plano!=="dias"; $("#gPerWrap").hidden=grant.plano!=="periodo";
  const r=grantRange(), pv=$("#gPrev");
  if(!r||(grant.plano==="periodo"&&(!r.ini||!r.fim))){pv.textContent="Escolha as datas do período.";return}
  if(r.fim&&r.ini&&r.fim<r.ini){pv.textContent="A data final é anterior à inicial.";return}
  const total=r.fim?daysLeft(r.fim)-daysLeft(r.ini)+1:null;
  pv.textContent=r.fim?`Acesso de ${fmtDate(r.ini)} até ${fmtDate(r.fim)} (${total} dia${total>1?"s":""})${r.ext?". Soma ao final do acesso atual":""}.`:`Acesso a partir de ${fmtDate(r.ini)}, sem data de término.`;
}
["#gDias","#gDe","#gAte"].forEach(s=>$(s).addEventListener("input",renderGrant));
$("#gNivel").onclick=e=>{const b=e.target.closest("button");if(b){grant.nivel=b.dataset.n;renderGrant()}};
$("#gPlano").onclick=e=>{const b=e.target.closest("button");if(b){grant.plano=b.dataset.pl;if(grant.plano==="periodo"&&!$("#gDe").value)$("#gDe").value=TODAY;renderGrant()}};
function clearGrant(){$("#gNome").value="";$("#gDias").value=30;$("#gErr").textContent="";grant={nivel:"editar",plano:"mensal",uid:null,email:"",nome:""};renderGrant()}
$("#gClear").onclick=clearGrant;
function prefill(uid,email,nome,nivel){grant.uid=uid;grant.email=email||"";grant.nome=nome||"";grant.nivel=nivel||"editar";$("#gNome").value=nome||"";renderGrant();$("#grantForm").scrollIntoView({behavior:"smooth",block:"start"})}
const tsStart=s=>s?Timestamp.fromDate(parse(s)):null;
const tsEnd=s=>s?Timestamp.fromDate(parse(addDays(s,1))):null;
$("#grantForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("#gErr").textContent=""; if(!grant.uid) return;
  const r=grantRange();
  if(!r||(grant.plano==="periodo"&&(!r.ini||!r.fim))) return $("#gErr").textContent="Defina o período.";
  if(r.fim&&r.fim<r.ini) return $("#gErr").textContent="A data final é anterior à inicial.";
  const ex=S.acessos.find(a=>a.id===grant.uid), ped=S.pedidos.find(p=>p.id===grant.uid);
  const inicio=ex&&r.ext?ex.inicio:r.ini;
  const d={uid:grant.uid,email:grant.email,nome:$("#gNome").value.trim()||ex?.nome||ped?.nome||"",nivel:grant.nivel,plano:grant.plano,
    dias:grant.plano==="dias"?parseInt($("#gDias").value,10):null,inicio,expira:r.fim,inicioTs:tsStart(inicio),expiraTs:tsEnd(r.fim),
    liberadoEm:new Date().toISOString(),liberadoPor:S.user?.displayName||""};
  $("#gBtn").disabled=true;
  try{
    await db.doc("acessos/"+grant.uid).set(d);
    if(ped) await db.doc("pedidos/"+ped.id).delete();
    const nome=d.nome?d.nome.split(" ")[0]:"";
    const msg=`Olá${nome?" "+nome:""}! ${ex?"Renovei":"Liberei"} seu acesso à agenda "${AG.nome}" (${NIVEL[d.nivel]}) ${d.expira?`de ${fmtDate(d.inicio)} até ${fmtDate(d.expira)}`:`a partir de ${fmtDate(d.inicio)}, sem data de término`}. Entre com seu e-mail ${d.email} e sua senha em ${location.href.split("#")[0]}`;
    const sent=await sendEmail(d.email,`Acesso liberado: ${AG.nome}`,msg);
    $("#gMsg").textContent=msg; $("#gDone").hidden=false;
    $("#gDoneInfo").textContent=sent?"Enviamos este aviso por e-mail para a pessoa. Ela também vê o tempo restante ao entrar.":"Cole o aviso no e-mail ou WhatsApp da pessoa. Ela também vê o tempo restante ao entrar.";
    toast(ex?"Acesso renovado":"Acesso liberado"); clearGrant();
  }catch(err){$("#gErr").textContent="Não foi possível salvar. Tente de novo."}
  finally{$("#gBtn").disabled=false}
});
$("#gDoneX").onclick=()=>$("#gDone").hidden=true;
$("#gCopy").onclick=()=>copyText($("#gMsg").textContent,"Aviso copiado");
$("#accPanel").addEventListener("click",async e=>{
  const b=e.target.closest("button"); if(!b) return; const d=b.dataset;
  const conf=id=>$(`[data-aconf="${CSS.escape(id)}"]`);
  try{
    if(d.pok){const p=S.pedidos.find(x=>x.id===d.pok);const ex=S.acessos.find(a=>a.id===p.id);prefill(p.id,p.email,p.nome,ex?.nivel)}
    if(d.pno){await db.doc("pedidos/"+d.pno).delete();toast("Pedido recusado")}
    if(d.aren){const a=S.acessos.find(x=>x.id===d.aren);prefill(a.id,a.email,a.nome,a.nivel)}
    if(d.aniv){const a=S.acessos.find(x=>x.id===d.aniv);await db.doc("acessos/"+a.id).update({nivel:a.nivel==="editar"?"ver":"editar"});toast("Nível alterado")}
    if(d.arev) conf(d.arev).hidden=false;
    if(d.ano) conf(d.ano).hidden=true;
    if(d.ayes){await db.doc("acessos/"+d.ayes).delete();toast("Acesso revogado")}
  }catch(err){fail(err)}
});

/* ================= painel ================= */
const MES=new Date().toLocaleDateString("pt-BR",{month:"long"});
function hbars(rows,max){
  return rows.map(r=>`<div class="hbar" style="--pc:${r.c||"var(--accent)"}"><span class="nm" title="${esc(r.n)}">${esc(r.n)}</span><span class="tr"><span class="fl" style="display:block;width:${max?Math.max(3,r.v/max*100):0}%"></span></span><span class="v">${r.v}${r.m?`<small>${brl.format(r.m)}</small>`:""}</span></div>`).join("");
}
function itemHTML(t,extra){
  const p=PRIO[t.prioridade||"media"];
  return `<button class="ditem" type="button" style="--pc:${p.c}" ${needAttr(t.id,"edit")}><span class="dot"></span><span class="tt">${esc(t.titulo)}</span>${extra||""}${t.valor&&AG.valores?`<span class="mo">${brl.format(t.valor)}</span>`:""}</button>`;
}
function renderPainel(){
  const sel=$("#pGrupo"), cur=sel.value;
  sel.innerHTML=`<option value="">Todos os grupos</option>`+S.groups.map(g=>`<option value="${g.id}">${esc(g.nome)}</option>`).join("")+`<option value="-">Sem grupo</option>`;
  sel.value=[...sel.options].some(o=>o.value===cur)?cur:"";
  const body=$("#pBody"); if(!S.ready) return;
  const gf=sel.value, T=S.tasks.filter(t=>!gf||(gf==="-"?!t.grupo:t.grupo===gf));
  if(!T.length){body.innerHTML=`<div class="empty"><strong>Sem tarefas para mostrar</strong>Cadastre tarefas na página Tarefas e o painel se monta sozinho.</div>`;return}
  const pend=T.filter(t=>!t.concluida), late=pend.filter(isLate).sort((a,b)=>a.prazo.localeCompare(b.prazo));
  const ym=TODAY.slice(0,7);
  const doneMonth=T.filter(t=>t.concluida&&t.concluidaEm&&localDay(t.concluidaEm).slice(0,7)===ym);
  const dueMonth=T.filter(t=>t.prazo&&t.prazo.slice(0,7)===ym), dueDone=dueMonth.filter(t=>t.concluida).length;
  const taxa=dueMonth.length?Math.round(dueDone/dueMonth.length*100):null;
  const lim=addDays(TODAY,30), paySum=pend.filter(t=>t.valor&&t.prazo&&t.prazo<=lim).reduce((a,t)=>a+t.valor,0);
  const lateSum=late.reduce((a,t)=>a+(t.valor||0),0);
  let h=`<section class="stats" aria-label="Resumo do painel">
    <div class="stat good"><b>${doneMonth.length}</b><span>Concluídas</span><small class="hint">em ${MES}</small></div>
    <div class="stat"><b>${taxa===null?"–":taxa+"%"}</b><span>Do mês feito</span><small class="hint">${dueMonth.length?`${dueDone} de ${dueMonth.length} com prazo`:"nada com prazo"}</small></div>
    <button class="stat late" type="button" data-go="atrasadas"><b>${late.length}</b><span>Atrasadas</span><small class="hint">${AG.valores&&lateSum?brl.format(lateSum):late.length?"ver lista":"tudo em dia"}</small></button>
    ${AG.valores?`<div class="stat"><b>${brl.format(paySum)}</b><span>A pagar</span><small class="hint">próximos 30 dias</small></div>`:`<button class="stat" type="button" data-go="pendentes"><b>${pend.length}</b><span>Pendentes</span><small class="hint">ver lista</small></button>`}
  </section>`;
  if(late.length) h+=`<section class="card"><div class="card-h"><h2>Precisa de atenção</h2><small>${late.length} atrasada${late.length>1?"s":""}</small></div><div class="ditems">${
    late.slice(0,6).map(t=>itemHTML(t,`<span class="lt">${-daysLeft(t.prazo)}d</span>`)).join("")}${late.length>6?`<button class="ditem" type="button" data-go="atrasadas" style="color:var(--accent)">Ver todas as ${late.length}</button>`:""}</div></section>`;
  let days="";
  for(let i=0;i<7;i++){
    const d=addDays(TODAY,i), dd=parse(d), it=pend.filter(t=>t.prazo===d).sort((a,b)=>PRIO[a.prioridade||"media"].o-PRIO[b.prioridade||"media"].o);
    days+=`<div class="drow${i===0?" today":""}"><div class="dl"><b>${String(dd.getDate()).padStart(2,"0")}</b><span>${i===0?"hoje":dd.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","")}</span></div><div class="ditems">${it.length?it.map(t=>itemHTML(t)).join(""):'<span class="free">Livre</span>'}</div></div>`;
  }
  const semPrazo=pend.filter(t=>!t.prazo).length;
  h+=`<section class="card"><div class="card-h"><h2>Próximos 7 dias</h2><small>${fmtDate(TODAY).slice(0,5)} a ${fmtDate(addDays(TODAY,6)).slice(0,5)}${semPrazo?` · ${semPrazo} sem prazo`:""}</small></div><div>${days}</div></section>`;
  const ws=s=>{const d=parse(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d)};
  const w0=ws(TODAY), weeks=[...Array(8)].map((_,i)=>addDays(w0,-7*(7-i)));
  const cnt=weeks.map(w=>T.filter(t=>t.concluida&&t.concluidaEm&&ws(localDay(t.concluidaEm))===w).length), mx=Math.max(1,...cnt);
  h+=`<section class="card"><div class="card-h"><h2>Concluídas por semana</h2><small>últimas 8 semanas · ${cnt.reduce((a,b)=>a+b,0)} no total</small></div>
    <div class="weeks">${weeks.map((w,i)=>`<div class="wk${i===7?" now":""}"><b>${cnt[i]}</b><div class="col" style="height:${cnt[i]/mx*85}%"></div><span>${i===7?"esta":fmtDate(w).slice(0,5)}</span></div>`).join("")}</div></section>`;
  const pr=["urgente","alta","media","baixa"].map(k=>({n:PRIO[k].n,c:PRIO[k].c,v:pend.filter(t=>(t.prioridade||"media")===k).length}));
  const gm=new Map(); pend.forEach(t=>{const k=t.grupo&&gName(t.grupo)?gName(t.grupo):"Sem grupo";const o=gm.get(k)||{n:k,v:0,m:0};o.v++;o.m+=AG.valores?(t.valor||0):0;gm.set(k,o)});
  const gr=[...gm.values()].sort((a,b)=>b.v-a.v).slice(0,8);
  h+=`<div class="two">
    <section class="card"><div class="card-h"><h2>Pendentes por prioridade</h2><small>${pend.length}</small></div><div class="hbars">${hbars(pr,Math.max(...pr.map(r=>r.v)))}</div></section>
    <section class="card"><div class="card-h"><h2>Pendentes por grupo</h2>${AG.valores?"<small>qtd · valor</small>":""}</div><div class="hbars">${gr.length?hbars(gr,gr[0].v):'<span class="free">Nada pendente</span>'}</div></section></div>`;
  const em=new Map(); pend.forEach(t=>{const k=t.executor||"Sem responsável";em.set(k,(em.get(k)||0)+1)});
  if([...em.keys()].some(k=>k!=="Sem responsável")){const er=[...em].map(([n,v])=>({n,v})).sort((a,b)=>b.v-a.v).slice(0,6);
    h+=`<section class="card"><div class="card-h"><h2>Quem vai executar</h2><small>tarefas pendentes</small></div><div class="hbars">${hbars(er,er[0].v)}</div></section>`}
  body.innerHTML=h;
}
$("#pGrupo").onchange=renderPainel;

/* ================= configurações ================= */
function saveLP(){
  try{localStorage.setItem("agenda.prefs",JSON.stringify(LP))}catch{}
  if(S.user&&verified()) setDoc(doc(fs,"prefs",S.user.uid),{tema:LP.tema,pagina:LP.pagina,aba:LP.aba}).catch(()=>{});
}
async function loadCloudPrefs(){
  try{const d=await getDoc(doc(fs,"prefs",S.user.uid));if(!d.exists())return;const c=d.data();let ch=false;
    ["tema","pagina","aba"].forEach(k=>{if(c[k]&&c[k]!==LP[k]){LP[k]=c[k];ch=true}});
    if(ch){try{localStorage.setItem("agenda.prefs",JSON.stringify(LP))}catch{}applyTheme();renderAll()}}catch{}
}
function cleanTargets(){const cut=addDays(TODAY,-parseInt($("#cIdade").value,10));return S.tasks.filter(t=>t.concluida&&t.concluidaEm&&localDay(t.concluidaEm)<cut)}
function syncConfig(){
  document.querySelectorAll("#cTema button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.tema===LP.tema));
  $("#cPagina").value=LP.pagina; $("#cAba").value=LP.aba;
  const own=isOwner();
  $("#cOwner").hidden=!own; $("#cClean").hidden=!canWrite(); $("#cBackup").hidden=!own;
  $("#cMeDel").hidden=!(S.user&&!own); $("#cOut").hidden=!S.user; $("#cIn").hidden=!!S.user;
  if(S.user) $("#cOutInfo").textContent="Conectado como "+S.user.email;
  if(own){
    if(document.activeElement!==$("#cNome")) $("#cNome").value=AG.nome||"";
    document.querySelectorAll("#cPrio button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.cp===AG.prioPadrao));
    $("#cVal").checked=AG.valores!==false; $("#cPub").checked=!!S.publico;
    const subs=S.groups.reduce((a,g)=>a+(g.subgrupos||[]).length,0);
    $("#cGInfo").textContent=S.groups.length?`${S.groups.length} grupo${S.groups.length>1?"s":""}, ${subs} subgrupo${subs===1?"":"s"}`:"Nenhum grupo criado";
    const at=S.acessos.filter(isActive).length, pd=S.pedidos.length;
    $("#cAInfo").textContent=`${at} pessoa${at===1?"":"s"} com acesso${pd?` · ${pd} pedido${pd>1?"s":""} aguardando`:""}`;
    renderBackups();
  }
  if(canWrite()){const n=cleanTargets().length;$("#cCleanInfo").textContent=n?`${n} tarefa${n>1?"s":""} nesse período.`:"Nenhuma tarefa nesse período.";$("#cCleanBtn").disabled=!n}
  $("#cRole").textContent=own?"Dono da agenda":isMember()?leftInfo(S.acc).t:S.user?"Aguardando liberação":"Visitante";
  const p=S.tasks.filter(t=>!t.concluida).length;
  $("#cTot").textContent=S.ready?`${p} pendente${p===1?"":"s"} · ${S.tasks.length-p} concluída${S.tasks.length-p===1?"":"s"}`:"–";
}
async function saveAG(patch){
  if(!isOwner()) return; const prev={...AG}; Object.assign(AG,patch); renderAll();
  try{await setDoc(doc(fs,"config","agenda"),{nome:AG.nome,prioPadrao:AG.prioPadrao,valores:AG.valores});toast("Configuração salva")}
  catch(err){Object.assign(AG,prev);renderAll();fail(err)}
}
$("#cTema").onclick=e=>{const b=e.target.closest("button");if(!b)return;LP.tema=b.dataset.tema;saveLP();applyTheme();syncConfig()};
$("#cPagina").onchange=e=>{LP.pagina=e.target.value;saveLP();toast("Preferência salva")};
$("#cAba").onchange=e=>{LP.aba=e.target.value;S.tab=LP.aba;saveLP();toast("Preferência salva")};
$("#cNomeForm").onsubmit=e=>{e.preventDefault();const n=$("#cNome").value.trim()||AG_DEF.nome;$("#cNome").blur();saveAG({nome:n})};
$("#cPrio").onclick=e=>{const b=e.target.closest("button");if(b)saveAG({prioPadrao:b.dataset.cp})};
$("#cVal").onchange=e=>saveAG({valores:e.target.checked});
$("#cPub").onchange=async e=>{try{await setDoc(doc(fs,"config","publico"),{ver:e.target.checked});toast(e.target.checked?"Visitantes podem ver a agenda":"Só contas liberadas veem a agenda")}catch(err){e.target.checked=!e.target.checked;fail(err)}};
$("#cGrupos").onclick=openGroups;
$("#cAcessos").onclick=openAcc;
$("#cLogout").onclick=async()=>{await signOut(auth);toast("Você saiu da conta")};
$("#cLogin").onclick=openGate;
$("#cIdade").onchange=()=>{$("#cCleanConf").hidden=true;syncConfig()};
$("#cCleanBtn").onclick=()=>{const n=cleanTargets().length;if(!n)return;$("#cCleanQ").textContent=`Apagar ${n} tarefa${n>1?"s":""} concluída${n>1?"s":""}? Isso não pode ser desfeito.`;$("#cCleanConf").hidden=false};
$("#cCleanNo").onclick=()=>$("#cCleanConf").hidden=true;
$("#cCleanYes").onclick=async()=>{
  const L=cleanTargets(); if(!L.length) return; $("#cCleanYes").disabled=true;
  try{await batchRun(L.map(t=>({t:"del",p:"tarefas/"+t.id})));
    for(const t of L) if(t.foto&&!S.tasks.some(x=>x.foto===t.foto&&!L.includes(x))) fotos.delete(t.foto).catch(()=>{});
    toast(`${L.length} tarefa${L.length>1?"s":""} apagada${L.length>1?"s":""}`)}catch(err){fail(err)}
  $("#cCleanYes").disabled=false; $("#cCleanConf").hidden=true;
};

/* ================= backup e restauração (dono) ================= */
let pendingRestore=null, busy=false;
const clean=o=>JSON.parse(JSON.stringify(o));
function bkPayload(motivo){return {app:"minha-agenda",versao:1,criadoEm:new Date().toISOString(),motivo:motivo||"Manual",nT:S.tasks.length,nG:S.groups.length,tarefas:clean(S.tasks),grupos:clean(S.groups)}}
async function makeBackup(motivo){
  await addDoc(collection(fs,"backups"),bkPayload(motivo));
  const old=[...S.backups].sort((a,b)=>(b.criadoEm||"").localeCompare(a.criadoEm||"")).slice(9);
  for(const b of old){try{await deleteDoc(doc(fs,"backups",b.id))}catch{}}
}
function renderBackups(){
  const L=[...S.backups].sort((a,b)=>(b.criadoEm||"").localeCompare(a.criadoEm||""));
  $("#bkList").innerHTML=L.length?L.map(b=>`<div class="bk"><div><b>${fmtDT(b.criadoEm)}</b><small>${esc(b.motivo||"Manual")} · ${b.nT??(b.tarefas||[]).length} tarefas · ${b.nG??(b.grupos||[]).length} grupos</small></div>
    <div class="ops"><button class="btn sec" type="button" data-bkr="${b.id}">Restaurar</button><button class="ghost" type="button" data-bkf="${b.id}">Baixar</button><button class="ghost" type="button" data-bkc="${b.id}">Copiar</button><button class="ghost" type="button" data-bkd="${b.id}">Excluir</button></div></div>`).join("")
    :`<div class="empty" style="padding:16px"><strong style="font-size:15px">Nenhum backup ainda</strong>Toque em Criar backup para guardar a primeira cópia.</div>`;
}
function validBackup(d){return d&&Array.isArray(d.tarefas)&&Array.isArray(d.grupos)}
function askRestore(data,label){
  if(!validBackup(data)){toast("Este arquivo não é um backup da agenda");return}
  pendingRestore=data;
  $("#bkRestoreQ").textContent=`Restaurar ${label} (${data.tarefas.length} tarefas, ${data.grupos.length} grupos)? As tarefas e grupos atuais serão substituídos. Antes, um backup do estado atual é criado.`;
  $("#bkRestore").hidden=false; $("#bkRestore").scrollIntoView({behavior:"smooth",block:"center"});
}
async function restore(data){
  if(busy) return; busy=true; $("#bkRestoreYes").disabled=true; toast("Restaurando…");
  try{
    await makeBackup("Antes de restaurar");
    const ops=[...S.tasks.map(t=>({t:"del",p:"tarefas/"+t.id})),...S.groups.map(g=>({t:"del",p:"grupos/"+g.id}))];
    await batchRun(ops);
    const add=[];
    for(const g of data.grupos){const {id,...r}=g;add.push({t:"set",p:"grupos/"+(id||doc(collection(fs,"grupos")).id),d:r})}
    for(const t of data.tarefas){const {id,...r}=t;add.push({t:"set",p:"tarefas/"+(id||doc(collection(fs,"tarefas")).id),d:r})}
    await batchRun(add);
    $("#bkRestore").hidden=true; pendingRestore=null; S.g=""; S.sub="";
    toast(`Backup restaurado: ${data.tarefas.length} tarefas`);
  }catch(err){fail(err)} finally{busy=false;$("#bkRestoreYes").disabled=false}
}
function download(data){
  const blob=new Blob([JSON.stringify(data,null,1)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`agenda-backup-${(data.criadoEm||new Date().toISOString()).slice(0,10)}.json`;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}
function showCopy(data){
  const txt=JSON.stringify(data);$("#bkText").value=txt;$("#bkCopyBox").hidden=false;
  try{navigator.clipboard.writeText(txt).then(()=>toast("Backup copiado"),()=>{$("#bkText").focus();$("#bkText").select()})}catch{$("#bkText").select()}
}
$("#bkNow").onclick=async()=>{if(busy)return;busy=true;$("#bkNow").disabled=true;
  try{await makeBackup("Manual");toast("Backup criado")}catch(err){fail(err)} finally{busy=false;$("#bkNow").disabled=false}};
$("#bkDown").onclick=()=>download(bkPayload("Arquivo"));
$("#bkList").onclick=async e=>{
  const b=e.target.closest("button"); if(!b) return; const d=b.dataset;
  const bk=S.backups.find(x=>x.id===(d.bkr||d.bkc||d.bkd||d.bkf)); if(!bk) return;
  const {id,...r}=bk;
  if(d.bkr) askRestore(bk,"o backup de "+fmtDT(bk.criadoEm));
  if(d.bkf) download(r);
  if(d.bkc) showCopy(r);
  if(d.bkd){try{await deleteDoc(doc(fs,"backups",bk.id));toast("Backup excluído")}catch(err){fail(err)}}
};
$("#bkRestoreNo").onclick=()=>{$("#bkRestore").hidden=true;pendingRestore=null};
$("#bkRestoreYes").onclick=()=>{if(pendingRestore)restore(pendingRestore)};
$("#bkCopyX").onclick=()=>$("#bkCopyBox").hidden=true;
$("#bkFile").onchange=e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  const r=new FileReader(); r.onload=()=>{try{askRestore(JSON.parse(r.result),"o arquivo "+f.name)}catch{toast("Não foi possível ler o arquivo")}}; r.readAsText(f);
};

/* ================= apagar informações (pede a senha) ================= */
async function confirmPass(pass){await reauthenticateWithCredential(S.user,EmailAuthProvider.credential(S.user.email,pass))}
$("#delForm").onsubmit=async e=>{
  e.preventDefault(); const err=$("#dErr"); err.textContent="";
  const T=$("#dT").checked,F=$("#dF").checked,G=$("#dG").checked,A=$("#dA").checked;
  if(!T&&!F&&!G&&!A){err.textContent="Marque o que deseja apagar.";return}
  if(busy) return; busy=true; $("#dBtn").disabled=true;
  try{
    try{await confirmPass($("#dPass").value)}catch(x){err.textContent=authMsg(x);return}
    $("#dPass").value="";
    if(T||G) await makeBackup("Antes de apagar");
    const tasks=[...S.tasks], ops=[];
    if(F){for(const id of new Set(tasks.map(t=>t.foto).filter(Boolean))) ops.push({t:"del",p:"fotos/"+id});
      if(!T) for(const t of tasks.filter(t=>t.foto)) ops.push({t:"set",p:"tarefas/"+t.id,d:(({id,...r})=>({...r,foto:null}))(t)})}
    if(T) tasks.forEach(t=>ops.push({t:"del",p:"tarefas/"+t.id}));
    if(G){S.groups.forEach(g=>ops.push({t:"del",p:"grupos/"+g.id}));S.g="";S.sub=""}
    if(A){S.acessos.forEach(a=>ops.push({t:"del",p:"acessos/"+a.id}));S.pedidos.forEach(p=>ops.push({t:"del",p:"pedidos/"+p.id}))}
    await batchRun(ops);
    toast("Apagado: "+[T&&"tarefas",F&&"fotos",G&&"grupos",A&&"acessos"].filter(Boolean).join(", ")+(T||G?". Backup criado antes":""));
  }catch(x){fail(x)} finally{busy=false;$("#dBtn").disabled=false}
};
$("#meDelForm").onsubmit=async e=>{
  e.preventDefault(); const err=$("#meDelErr"); err.textContent=""; $("#meDelBtn").disabled=true;
  try{
    await confirmPass($("#meDelPass").value);
    await deleteDoc(doc(fs,"pedidos",S.user.uid)).catch(()=>{});
    await deleteDoc(doc(fs,"prefs",S.user.uid)).catch(()=>{});
    await deleteUser(S.user); toast("Sua conta foi apagada");
  }catch(x){err.textContent=authMsg(x)} finally{$("#meDelBtn").disabled=false}
};

/* ================= dados e papéis ================= */
let unsub={data:null,user:[],owner:[]};
function stopList(k){(unsub[k]||[]).forEach(f=>{try{f()}catch{}});unsub[k]=[]}
function syncData(){
  const want=canRead();
  if(want&&!unsub.data){
    let gotT=false,gotG=false; S.dataErr=false;
    const done=()=>{if(gotT&&gotG)S.ready=true;renderAll()};
    const onErr=()=>{S.dataErr=true;S.ready=true;S.tasks=[];S.groups=[];if(unsub.data){unsub.data.forEach(f=>f());unsub.data=null}renderAll()};
    unsub.data=[
      db.collection("tarefas").onSnapshot(s=>{S.tasks=s.docs.map(d=>({id:d.id,...d.data()}));gotT=true;done()},onErr),
      db.collection("grupos").onSnapshot(s=>{S.groups=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.ordem??0)-(b.ordem??0)||String(a.nome).localeCompare(String(b.nome)));gotG=true;done()},onErr)];
  } else if(!want&&unsub.data){unsub.data.forEach(f=>f());unsub.data=null;S.tasks=[];S.groups=[];S.ready=true}
  else if(!want){S.ready=true}
}
function evalRole(){
  const u=S.user;
  if(u&&verified()&&u.email.toLowerCase()===DONO) S.role="owner";
  else if(u&&verified()&&isActive(S.acc)) S.role=S.acc.nivel==="editar"?"editar":"ver";
  else S.role="none";
  if(canWrite()) S.showGate=false;
  syncData(); renderAll();
}
function onUser(u){
  stopList("user"); stopList("owner");
  S.user=u||null; S.acc=null; S.myPedido=null; S.acessos=[]; S.pedidos=[]; S.backups=[]; gateKey="";
  if(u&&u.emailVerified){
    const own=u.email.toLowerCase()===DONO;
    if(own){
      unsub.owner=[
        db.collection("acessos").onSnapshot(s=>{S.acessos=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()},()=>{}),
        db.collection("pedidos").onSnapshot(s=>{S.pedidos=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.quando||"").localeCompare(b.quando||""));renderAll()},()=>{}),
        db.collection("backups").onSnapshot(s=>{S.backups=s.docs.map(d=>({id:d.id,...d.data()}));if(S.page==="config")renderBackups()},()=>{})];
      evalRole();
    } else {
      let gotA=false;
      unsub.user=[
        db.doc("acessos/"+u.uid).onSnapshot(d=>{S.acc=d.exists?{id:u.uid,...d.data()}:null;gotA=true;evalRole()},()=>{S.acc=null;gotA=true;evalRole()}),
        db.doc("pedidos/"+u.uid).onSnapshot(d=>{S.myPedido=d.exists?d.data():null;gateKey="";renderAll()},()=>{})];
      S.role="loading"; renderAll();
    }
    loadCloudPrefs();
  } else evalRole();
}

/* ================= início ================= */
if(!CONFIGURADO){S.role="none";S.ready=true;renderAll()}
else{
  renderAll();
  db.doc("config/publico").onSnapshot(d=>{S.publico=!!(d.exists&&d.data().ver);if(S.role!=="loading")evalRole()},()=>{S.publico=false});
  db.doc("config/agenda").onSnapshot(d=>{Object.assign(AG,AG_DEF,d.exists?d.data():{});renderAll()},()=>{});
  onAuthStateChanged(auth,u=>onUser(u));
}
