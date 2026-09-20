const SUPABASE_URL="https://pbhaqatyrjxnaithmowe.supabase.co";
const SUPABASE_KEY="sb_publishable_rNA8ggZxU1g_UhfCTGG96Q_MeCkQNjP";
const supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const chat=document.querySelector("#chat");
const form=document.querySelector("#composer");
const input=document.querySelector("#input");
const send=document.querySelector("#send");
const status=document.querySelector("#status");

let userId=null;
let conversationId=null;
let memory=[];
let ready=false;
let backendReady=false;
let sending=false;

function addMessage(role,text){
  document.querySelector(".welcome")?.remove();
  const row=document.createElement("div");
  row.className="msg "+role;
  const bubble=document.createElement("div");
  bubble.className="bubble";
  bubble.textContent=text;
  row.appendChild(bubble);
  chat.appendChild(row);
  requestAnimationFrame(()=>{chat.scrollTop=chat.scrollHeight});
}

function setStatus(text,kind=""){
  status.textContent=text;
  status.classList.toggle("ready",kind==="ready");
  status.classList.toggle("error",kind==="error");
}

function clean(s){
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function findMemories(q){
  const words=[...new Set(clean(q).split(/\W+/).filter(w=>w.length>3))];
  if(!words.length) return [];
  return memory
    .map(m=>({...m,score:words.reduce((n,w)=>n+(clean(m.content).includes(w)?1:0),0)}))
    .filter(m=>m.score>0)
    .sort((a,b)=>(b.score-a.score)||(Number(b.importance||0)-Number(a.importance||0)))
    .slice(0,4);
}

function rememberFrom(text){
  const patterns=[
    [/\bme llamo ([^.!?\n]+)/i,"nombre","fact"],
    [/\bmi nombre es ([^.!?\n]+)/i,"nombre","fact"],
    [/\bprefiero ([^.!?\n]+)/i,"preferencia","preference"],
    [/\bme gusta ([^.!?\n]+)/i,"gustos","preference"]
  ];
  return patterns.flatMap(([re,key,type])=>{
    const m=text.match(re);
    return m?[{memory_key:key,content:m[1].trim(),memory_type:type,importance:.8,source:"conversation"}]:[];
  });
}

function generate(q){
  const refs=findMemories(q);
  const c=clean(q);

  if(/^(hola|hey|buenas|saludos)\b/.test(c))
    return "Hola. Soy Fénix. Estoy conectado a tu memoria y al contexto de esta conversación.";

  if(c.includes("quien eres")||c.includes("que eres"))
    return "Soy Fénix, un sistema experimental centrado en contexto y memoria persistente. Esta versión todavía está en desarrollo.";

  if(c.includes("que recuerdas")||c.includes("que sabes de mi"))
    return refs.length
      ?"Recuerdo esto relacionado con tu pregunta:\n\n"+refs.map(x=>"• "+x.content).join("\n")
      :"Todavía no tengo recuerdos relevantes para esa pregunta.";

  if(refs.length)
    return "Estoy usando contexto que tengo guardado:\n\n"+refs.map(x=>"• "+x.content).join("\n")+"\n\nSobre tu mensaje: "+q;

  return "He recibido tu mensaje. El núcleo de Fénix está funcionando, pero el modelo generativo todavía no está conectado.";
}

function withTimeout(promise,ms,label){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))
  ]);
}

async function ensureAuth(){
  const sessionResult=await withTimeout(
    supabase.auth.getSession(),
    8000,
    "Supabase tardó demasiado en responder."
  );
  if(sessionResult.error) throw sessionResult.error;

  let session=sessionResult.data.session;

  if(!session){
    const authResult=await withTimeout(
      supabase.auth.signInAnonymously(),
      8000,
      "El inicio de sesión anónimo tardó demasiado."
    );
    if(authResult.error) throw new Error("Anonymous Sign-In está desactivado en Supabase.");
    session=authResult.data.session;
  }

  if(!session?.user?.id) throw new Error("Supabase no devolvió un usuario válido.");
  userId=session.user.id;
}

async function loadMemory(){
  const {data,error}=await withTimeout(
    supabase.from("fenix_memory")
      .select("id,memory_key,content,memory_type,importance,source,updated_at")
      .order("updated_at",{ascending:false})
      .limit(80),
    8000,
    "La memoria de Supabase no respondió."
  );
  if(error) throw error;
  memory=data||[];
}

async function ensureConversation(){
  const {data,error}=await withTimeout(
    supabase.from("fenix_conversations")
      .insert({user_id:userId,title:"Nueva conversación"})
      .select("id")
      .single(),
    8000,
    "No se pudo crear la conversación."
  );
  if(error) throw error;
  conversationId=data.id;
}

async function saveMessage(role,content){
  if(!backendReady||!conversationId||!userId) return;
  const {error}=await withTimeout(
    supabase.from("fenix_messages").insert({conversation_id:conversationId,user_id:userId,role,content}),
    8000,
    "No se pudo guardar el mensaje."
  );
  if(error) throw error;
}

async function saveMemories(items){
  if(!backendReady||!userId) return;

  for(const item of items){
    const {data:existing,error:findError}=await withTimeout(
      supabase.from("fenix_memory").select("id")
        .eq("user_id",userId)
        .eq("memory_key",item.memory_key)
        .eq("content",item.content)
        .limit(1),
      8000,
      "No se pudo consultar la memoria."
    );

    if(findError) throw findError;
    if(existing?.length) continue;

    const {error}=await withTimeout(
      supabase.from("fenix_memory").insert({...item,user_id:userId}),
      8000,
      "No se pudo guardar la memoria."
    );
    if(error) throw error;
  }

  await loadMemory();
}

async function boot(){
  ready=true;
  send.disabled=false;
  setStatus("iniciando");

  try{
    await ensureAuth();
    await loadMemory();
    await ensureConversation();
    backendReady=true;
    setStatus("online","ready");
  }catch(error){
    console.error("Fénix backend:",error);
    backendReady=false;
    setStatus("local","ready");
  }
}

form.addEventListener("submit",async event=>{
  event.preventDefault();

  const q=input.value.trim();
  if(!q||sending||!ready) return;

  sending=true;
  send.disabled=true;
  input.value="";
  input.style.height="auto";
  addMessage("user",q);

  try{
    if(backendReady) await saveMessage("user",q);

    const newMemory=rememberFrom(q);
    if(newMemory.length){
      memory=[...newMemory,...memory];
      if(backendReady) await saveMemories(newMemory);
    }

    const answer=generate(q);

    if(backendReady) await saveMessage("assistant",answer);
    addMessage("assistant",answer);
  }catch(error){
    console.error("Fénix message error:",error);
    const answer=generate(q);
    addMessage("assistant",answer+"\n\n[Modo local: Supabase no está disponible ahora mismo.]");
  }finally{
    sending=false;
    send.disabled=false;
    input.focus();
  }
});

input.addEventListener("input",()=>{
  input.style.height="auto";
  input.style.height=Math.min(input.scrollHeight,150)+"px";
});

input.addEventListener("keydown",event=>{
  if(event.key==="Enter"&&!event.shiftKey){
    event.preventDefault();
    form.requestSubmit();
  }
});

boot();