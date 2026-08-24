import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';

export class ChessRoom extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.env=env;
    this.sockets=new Map();
    this.state=null;
    this.lastChatAt={p1:0,p2:0};
    ctx.blockConcurrencyWhile(async()=>{
      this.state=await ctx.storage.get('state')||null;
      if(this.state)this.ensureState();
    });
  }

  ensureState(){
    this.state.connected||={p1:false,p2:false};
    this.state.tokens||={p1:null,p2:null};
    this.state.rematch||={p1:false,p2:false};
    this.state.round||=1;
    this.state.moves||=[];
    if(!Array.isArray(this.state.messages))this.state.messages=[];
    if(this.state.minutes===undefined)this.state.minutes=5;
    if(this.state.minutes===0){
      this.state.whiteMs=null;
      this.state.blackMs=null;
      this.state.turnStartedAt=null;
    }
  }

  async fetch(req){
    const url=new URL(req.url);
    if(url.pathname==='/registry')return this.registry(req);
    if(req.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});

    const role=url.searchParams.get('role');
    const token=url.searchParams.get('token')||'';
    const rawMinutes=Number(url.searchParams.get('minutes'));
    const minutes=rawMinutes===0?0:Math.min(10,Math.max(3,Number.isFinite(rawMinutes)&&rawMinutes?rawMinutes:5));
    const room=(url.searchParams.get('room')||'').toUpperCase();

    if(!['p1','p2'].includes(role))return new Response('Invalid role',{status:400});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    server.accept();

    if(!this.state){
      if(role!=='p1'){
        server.close(1008,'Sala ainda não existe');
        return new Response(null,{status:101,webSocket:client});
      }
      this.state=this.newState(minutes);
    }
    this.ensureState();

    const known=this.state.tokens[role];
    const live=Array.from(this.sockets.values()).includes(role);
    if(known&&token&&token!==known&&live){server.close(1008,'Vaga ocupada');return new Response(null,{status:101,webSocket:client})}
    if(known&&!token&&live){server.close(1008,'Vaga ocupada');return new Response(null,{status:101,webSocket:client})}
    if(!known||(!live&&token!==known))this.state.tokens[role]=token||crypto.randomUUID();

    for(const [sock,r] of this.sockets){
      if(r===role){
        try{sock.close(1000,'Reconectado em outro cliente')}catch{}
        this.sockets.delete(sock);
      }
    }

    this.state.connected[role]=true;
    this.sockets.set(server,role);
    if(this.state.connected.p1&&this.state.connected.p2&&!this.state.ready){
      this.state.ready=true;
      this.randomizeColors();
    }
    await this.save();
    await this.publish(room);

    server.addEventListener('message',e=>this.onMessage(server,e,room));
    server.addEventListener('close',()=>this.onClose(server,room));
    server.addEventListener('error',()=>this.onClose(server,room));
    server.send(JSON.stringify({type:'welcome',role,token:this.state.tokens[role],color:this.state.colors?.[role]||null,state:this.publicState()}));
    this.broadcast();
    return new Response(null,{status:101,webSocket:client});
  }

  async registry(req){
    const method=req.method;
    if(method==='GET'){
      let rooms=await this.ctx.storage.get('rooms')||{};
      const now=Date.now();
      for(const [k,v] of Object.entries(rooms))if(now-v.updated>120000||v.status==='finished')delete rooms[k];
      await this.ctx.storage.put('rooms',rooms);
      return Response.json(Object.values(rooms).sort((a,b)=>b.updated-a),{headers:cors()});
    }
    if(method==='POST'){
      const d=await req.json(),rooms=await this.ctx.storage.get('rooms')||{};
      if(d.remove)delete rooms[d.room];
      else rooms[d.room]={room:d.room,minutes:d.minutes,status:d.status,players:d.players,updated:Date.now()};
      await this.ctx.storage.put('rooms',rooms);
      return new Response('ok',{headers:cors()});
    }
    return new Response('bad',{status:400});
  }

  async publish(room){
    if(!room||room==='__LOBBY__')return;
    const lobby=this.env.CHESS_ROOMS.getByName('__LOBBY__');
    const players=Number(!!this.state.connected.p1)+Number(!!this.state.connected.p2);
    const status=this.state.result?'finished':this.state.ready?'playing':'waiting';
    await lobby.fetch('https://internal/registry',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({room,minutes:this.state.minutes,status,players,remove:status==='finished'})
    });
  }

  newState(minutes){
    const ms=minutes===0?null:minutes*60000;
    return {
      fen:new Chess().fen(),minutes,whiteMs:ms,blackMs:ms,turn:'w',turnStartedAt:null,
      started:false,ready:false,connected:{p1:false,p2:false},tokens:{p1:null,p2:null},
      colors:null,lastMove:null,moves:[],messages:[],result:null,rematch:{p1:false,p2:false},round:1
    };
  }

  randomizeColors(){this.state.colors=Math.random()<.5?{p1:'w',p2:'b'}:{p1:'b',p2:'w'}}

  async onMessage(socket,event,room){
    let m;try{m=JSON.parse(event.data)}catch{return}
    const role=this.sockets.get(socket);if(!role)return;

    if(m.type==='chat'){
      if(!this.state.ready||this.state.result)return;
      const now=Date.now();
      if(now-(this.lastChatAt[role]||0)<400)return;
      const text=String(m.text??'').replace(/\s+/g,' ').trim().slice(0,200);
      if(!text)return;
      this.lastChatAt[role]=now;
      this.state.messages.push({role,color:this.state.colors?.[role]||null,text,at:now});
      if(this.state.messages.length>50)this.state.messages=this.state.messages.slice(-50);
      await this.save();this.broadcast();return;
    }
    if(m.type==='sync'){
      this.consumeClock();await this.save();this.broadcast();await this.publish(room);return;
    }
    if(m.type==='rematch'){
      if(!this.state.result)return;
      this.state.rematch[role]=true;
      if(this.state.rematch.p1&&this.state.rematch.p2)this.resetRound();
      await this.save();this.broadcast();await this.publish(room);return;
    }
    if(this.state.result)return;
    if(m.type==='resign'){
      const loser=this.state.colors[role];
      this.state.result=loser==='w'?'Pretas venceram — desistência':'Brancas venceram — desistência';
      this.state.turnStartedAt=null;
      await this.ctx.storage.deleteAlarm();
      await this.save();this.broadcast();await this.publish(room);return;
    }
    if(m.type!=='move'||!this.state.ready)return;

    const pc=this.state.colors[role];
    if(pc!==this.state.turn)return;
    this.consumeClock();
    if(this.state.result){await this.save();this.broadcast();await this.publish(room);return}

    const chess=new Chess(this.state.fen);
    let move;
    try{move=chess.move({from:m.from,to:m.to,promotion:m.promotion||'q'})}catch{return}
    if(!move)return;

    this.state.fen=chess.fen();
    const moveRecord={
      ply:this.state.moves.length+1,
      color:move.color,
      piece:move.piece,
      from:move.from,
      to:move.to,
      captured:move.captured||null,
      promotion:move.promotion||null,
      flags:move.flags||'',
      san:move.san
    };
    this.state.moves.push(moveRecord);
    this.state.lastMove={from:move.from,to:move.to,san:move.san};
    this.state.turn=chess.turn();
    if(!this.state.started)this.state.started=true;

    if(chess.isCheckmate())this.state.result=move.color==='w'?'Brancas venceram — xeque-mate':'Pretas venceram — xeque-mate';
    else if(chess.isStalemate())this.state.result='Empate — afogamento';
    else if(chess.isThreefoldRepetition())this.state.result='Empate — repetição tripla';
    else if(chess.isInsufficientMaterial())this.state.result='Empate — material insuficiente';
    else if(chess.isDraw())this.state.result='Empate';

    this.state.turnStartedAt=this.state.minutes===0||this.state.result?null:Date.now();
    await this.save();
    await this.scheduleAlarm();
    this.broadcast();
    await this.publish(room);
  }

  resetRound(){
    const ms=this.state.minutes===0?null:this.state.minutes*60000;
    Object.assign(this.state,{
      fen:new Chess().fen(),whiteMs:ms,blackMs:ms,turn:'w',turnStartedAt:null,started:false,
      ready:true,lastMove:null,moves:[],messages:[],result:null,rematch:{p1:false,p2:false},round:this.state.round+1
    });
    this.randomizeColors();
  }

  consumeClock(){
    if(this.state.minutes===0)return;
    if(!this.state.started||!this.state.turnStartedAt||this.state.result)return;
    const e=Date.now()-this.state.turnStartedAt;
    if(this.state.turn==='w'){
      this.state.whiteMs=Math.max(0,this.state.whiteMs-e);
      if(!this.state.whiteMs)this.state.result='Pretas venceram — tempo';
    }else{
      this.state.blackMs=Math.max(0,this.state.blackMs-e);
      if(!this.state.blackMs)this.state.result='Brancas venceram — tempo';
    }
    this.state.turnStartedAt=this.state.result?null:Date.now();
  }

  async scheduleAlarm(){
    if(this.state?.minutes===0||!this.state?.started||this.state.result||!this.state.turnStartedAt){
      await this.ctx.storage.deleteAlarm();return;
    }
    await this.ctx.storage.setAlarm(Date.now()+Math.max(1,this.state.turn==='w'?this.state.whiteMs:this.state.blackMs));
  }

  async alarm(){
    this.consumeClock();await this.save();this.broadcast();if(!this.state.result)await this.scheduleAlarm();
  }

  async onClose(socket,room){
    const role=this.sockets.get(socket);this.sockets.delete(socket);
    if(role&&!Array.from(this.sockets.values()).includes(role)){
      this.state.connected[role]=false;await this.save();this.broadcast();await this.publish(room);
    }
  }

  publicState(){const{tokens,...safe}=this.state||{};return safe}
  async save(){await this.ctx.storage.put('state',this.state)}
  broadcast(){const msg=JSON.stringify({type:'state',state:this.publicState()});for(const s of this.sockets.keys())try{s.send(msg)}catch{}}
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{headers:cors()});
    if(url.pathname==='/lobby')return env.CHESS_ROOMS.getByName('__LOBBY__').fetch('https://internal/registry');
    const room=(url.searchParams.get('room')||'').toUpperCase().replace(/[^A-Z0-9_]/g,'').slice(0,12);
    if(!room)return new Response('room required',{status:400,headers:cors()});
    return env.CHESS_ROOMS.getByName(room).fetch(request);
  }
};
function cors(){return{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}}
