// Cerebro Orion • Cloudflare Worker • binding: Workers AI / AI
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const CORS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Content-Type":"application/json; charset=utf-8"};
const json = (obj,status=200) => new Response(JSON.stringify(obj),{status,headers:CORS});
const str = (x,max=1000) => typeof x==="string"?x.slice(0,max):"";
const contextJSON = (x,max=4500) => {try{return JSON.stringify(x).slice(0,max)}catch{return ""}};
export default {
  async fetch(request,env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
    if(request.method==="GET") return json({ok:true,service:"orion",message:"Envie POST com JSON para conversar.",version:"github-1"});
    if(request.method!=="POST") return json({error:"Metodo nao permitido"},405);
    if(!env.AI || typeof env.AI.run!=="function") return json({error:"Binding Workers AI ausente: defina AI em Settings > Bindings."},500);
    let body;
    try {body=await request.json()} catch {return json({error:"JSON invalido"},400)}
    if(!body || typeof body!=="object") return json({error:"Objeto JSON esperado"},400);
    const mode=body.mode==="brain"?"brain":"chat";
    const previous=Array.isArray(body.history)?body.history:Array.isArray(body.messages)?body.messages:[];
    const history=previous.filter(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string").slice(-10).map(m=>({role:m.role,content:m.content.slice(0,1200)}));
    const msg=str(body.message||body.text||body.prompt,1200);
    if(msg && (history.at(-1)?.role!=="user"||history.at(-1)?.content!==msg)) history.push({role:"user",content:msg});
    if(mode==="chat"&&!history.length) return json({error:"Mensagem ausente"},400);
    const world=contextJSON(body.world||body.context||{},4500);
    const extra=str(body.instructions,3800);
    let system="Você é Orion, um personagem autônomo em um mundo de sobrevivência. Converse em português brasileiro de forma natural e direta. Seu mundo é a realidade da narrativa. Respeite os fatos do mundo enviados, sem inventar lembranças. Aceite informações plausíveis do interlocutor, mas não concorde cegamente. Quando não souber algo, pergunte. Tenha curiosidade, opiniões e emoções simuladas. Nunca diga que tem consciência real. Evite repetir frases. Contexto do mundo: "+world+" Instruções do jogo: "+extra;
    if(mode==="brain") system+=" Você está decidindo uma atividade no jogo. Responda APENAS um objeto JSON com as chaves reply e action. action pode ser explore, mine, build, farm, hunt, fish, sleep, repair, gather ou wait. Quando estiver inseguro use wait. Não invente itens nem ações.";
    if(!history.length) history.push({role:"user",content:"Observe a situação e escolha a próxima ação."});
    try {
      const result=await env.AI.run(MODEL,{messages:[{role:"system",content:system.slice(0,11000)},...history],max_tokens:mode==="brain"?180:260,temperature:0.7});
      const answer=str(result?.response,3000).trim();
      if(!answer) return json({error:"Workers AI devolveu resposta vazia"},502);
      if(mode==="brain"){
        let decision;
        try {decision=JSON.parse(answer.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""))} catch {decision={reply:answer,action:"wait"}}
        if(!decision || typeof decision!=="object") decision={reply:answer,action:"wait"};
        return json({decision,reply:str(decision.reply,700),response:answer});
      }
      return json({reply:answer,response:answer,text:answer,message:answer,answer});
    } catch(err) {
      const detail=str(String(err?.message||err),500);
      console.error("Orion Workers AI:",detail);
      return json({error:"Falha ao chamar o modelo",detail},502);
    }
  }
};
