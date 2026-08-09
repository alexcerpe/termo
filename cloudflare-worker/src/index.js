import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';

export class ChessRoom extends DurableObject {
  constructor(ctx, env){super(ctx,env);this.sockets=new Map();this.state=null;ctx.blockConcurrencyWhile(async()=>{this.state=await ctx.storage.get('state')||null;if(this.state)this.ensureState()})}
  ensureState(){this.state.connected ||= {p1:false,p2:false};this.state.tokens ||= {p1:null,p2:null};this.state.rematch ||= {p1:false,p2:false};this.state.round ||= 1}
  async fetch(req){
    if(req.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const url=new URL(req.url),role=url.searchParams.get('role'),token=url.searchParams.get('token')||'',minutes=Math.min(10,Math.max(3,Number(url.searchParams.get('minutes'))||5));
    if(!['p1','p2'].includes(role))return new Response('Invalid role',{status:400});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    if(!this.state){if(role!=='p1'){server.close(1008,'Sala ainda não existe');return new Response(null,{status:101,webSocket:client})}this.state=this.newState(minutes)}
    this.ensureState();
    const known=this.state.tokens[role],hasLiveSocket=Array.from(this.sockets.values()).includes(role);
    // A token only owns a seat while that player is actually connected. This prevents
    // abandoned/test rooms from permanently rejecting a legitimate new join/reconnect.
    if(known&&token&&token!==known&&hasLiveSocket){server.close(1008,'Vaga ocupada');return new Response(null,{status:101,webSocket:client})}
    if(known&&!token&&hasLiveSocket){server.close(1008,'Vaga ocupada');return new Response(null,{status:101,webSocket:client})}
    if(!known||(!hasLiveSocket&&token!==known))this.state.tokens[role]=token||crypto.randomUUID();
    for(const [sock,r] of this.sockets){if(r===role){try{sock.close(1000,'Reconectado em outro cliente')}catch{}this.sockets.delete(sock)}}
    this.state.connected[role]=true;this.sockets.set(server,role);
    if(this.state.connected.p1&&this.state.connected.p2&&!this.state.ready){this.state.ready=true;this.randomizeColors()}
    await this.save();
    server.addEventListener('message',e=>this.onMessage(server,e));server.addEventListener('close',()=>this.onClose(server));server.addEventListener('error',()=>this.onClose(server));
    server.send(JSON.stringify({type:'welcome',role,token:this.state.tokens[role],color:this.state.colors?.[role]||null,state:this.publicState()}));this.broadcast();return new Response(null,{status:101,webSocket:client});
  }
  newState(minutes){const ms=minutes*60000;return{fen:new Chess().fen(),minutes,whiteMs:ms,blackMs:ms,turn:'w',turnStartedAt:null,started:false,ready:false,connected:{p1:false,p2:false},tokens:{p1:null,p2:null},colors:null,lastMove:null,result:null,rematch:{p1:false,p2:false},round:1}}
  randomizeColors(){this.state.colors=Math.random()<.5?{p1:'w',p2:'b'}:{p1:'b',p2:'w'}}
  async onMessage(socket,event){let m;try{m=JSON.parse(event.data)}catch{return}const role=this.sockets.get(socket);if(!role)return;if(m.type==='sync'){this.consumeClock();await this.save();this.broadcast();return}if(m.type==='rematch'){if(!this.state.result)return;this.state.rematch[role]=true;if(this.state.rematch.p1&&this.state.rematch.p2)this.resetRound();await this.save();this.broadcast();return}if(this.state.result)return;if(m.type==='resign'){const loser=this.state.colors[role];this.state.result=loser==='w'?'Pretas venceram — desistência':'Brancas venceram — desistência';this.state.turnStartedAt=null;await this.save();this.broadcast();return}if(m.type!=='move'||!this.state.ready)return;const playerColor=this.state.colors[role];if(playerColor!==this.state.turn)return;this.consumeClock();if(this.state.result){await this.save();this.broadcast();return}const chess=new Chess(this.state.fen);let move;try{move=chess.move({from:m.from,to:m.to,promotion:m.promotion||'q'})}catch{return}if(!move)return;this.state.fen=chess.fen();this.state.lastMove={from:move.from,to:move.to,san:move.san};this.state.turn=chess.turn();if(!this.state.started)this.state.started=true;if(chess.isCheckmate())this.state.result=move.color==='w'?'Brancas venceram — xeque-mate':'Pretas venceram — xeque-mate';else if(chess.isStalemate())this.state.result='Empate — afogamento';else if(chess.isThreefoldRepetition())this.state.result='Empate — repetição tripla';else if(chess.isInsufficientMaterial())this.state.result='Empate — material insuficiente';else if(chess.isDraw())this.state.result='Empate';this.state.turnStartedAt=this.state.result?null:Date.now();await this.save();this.scheduleAlarm();this.broadcast()}
  resetRound(){const ms=this.state.minutes*60000;this.state.fen=new Chess().fen();this.state.whiteMs=ms;this.state.blackMs=ms;this.state.turn='w';this.state.turnStartedAt=null;this.state.started=false;this.state.ready=true;this.state.lastMove=null;this.state.result=null;this.state.rematch={p1:false,p2:false};this.state.round++;this.randomizeColors()}
  consumeClock(){if(!this.state.started||!this.state.turnStartedAt||this.state.result)return;const elapsed=Date.now()-this.state.turnStartedAt;if(this.state.turn==='w'){this.state.whiteMs=Math.max(0,this.state.whiteMs-elapsed);if(!this.state.whiteMs)this.state.result='Pretas venceram — tempo'}else{this.state.blackMs=Math.max(0,this.state.blackMs-elapsed);if(!this.state.blackMs)this.state.result='Brancas venceram — tempo'}this.state.turnStartedAt=this.state.result?null:Date.now()}
  async scheduleAlarm(){if(!this.state?.started||this.state.result||!this.state.turnStartedAt){await this.ctx.storage.deleteAlarm();return}const remaining=this.state.turn==='w'?this.state.whiteMs:this.state.blackMs;await this.ctx.storage.setAlarm(Date.now()+Math.max(1,remaining))}
  async alarm(){this.consumeClock();await this.save();this.broadcast();if(!this.state.result)await this.scheduleAlarm()}
  async onClose(socket){const role=this.sockets.get(socket);this.sockets.delete(socket);if(role&&!Array.from(this.sockets.values()).includes(role)){this.state.connected[role]=false;await this.save();this.broadcast()}}
  publicState(){if(!this.state)return null;const {tokens,...safe}=this.state;return safe}async save(){await this.ctx.storage.put('state',this.state)}broadcast(){const msg=JSON.stringify({type:'state',state:this.publicState()});for(const s of this.sockets.keys())try{s.send(msg)}catch{}}
}
export default {async fetch(request,env){const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{headers:cors()});const room=(url.searchParams.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);if(!room)return new Response('room required',{status:400,headers:cors()});return env.CHESS_ROOMS.getByName(room).fetch(request)}};function cors(){return{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,OPTIONS'}}