const W='https://xadrez-realtime.alex-cerpe.workers.dev';
const $=s=>document.querySelector(s);
let mins=5,ws=null,role=null,color=null,room=null,state=null,lastFen=null,selected=null,legal=[],lastMove=null,promo=null,retry=null,wake=null,resultSaved=false,game=new Chess(),soundOn=localStorage.getItem('chessSound')!=='0';
const glyph={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
const pieceName={k:'Rei',q:'Dama',r:'Torre',b:'Bispo',n:'Cavalo',p:'Peão'};
const key=(r=room,x=role)=>'chess:'+r+':'+x;
const getToken=(r=room,x=role)=>localStorage.getItem(key(r,x))||'';
const safe=s=>{try{return JSON.parse(s)}catch{return null}};
const timeLabel=m=>m===0?'Sem limite':m+' min';

function setActive(){if(room&&role)localStorage.setItem('chessActive',JSON.stringify({room,role,mins,at:Date.now()}))}
function clearActive(){localStorage.removeItem('chessActive')}
function view(v){
  ['home','waiting','game'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==v));
  const playing=v==='game';
  document.body.classList.toggle('gameMode',playing);
  $('#resign').classList.toggle('hidden',!playing);
}

function setupTimeButtons(){
  document.querySelectorAll('.time').forEach(b=>b.onclick=()=>{
    mins=Number(b.dataset.min);
    document.querySelectorAll('.time').forEach(x=>x.classList.toggle('active',x===b));
  });
}

async function loadLobby(){
  if(!$('#home')||$('#home').classList.contains('hidden'))return;
  try{
    const r=await fetch(W+'/lobby',{cache:'no-store'});
    if(!r.ok)throw new Error();
    const rooms=await r.json();
    const open=rooms.filter(x=>x.status==='waiting'&&x.players<2);
    $('#lobbyCount').textContent=open.length?open.length+' aberta'+(open.length>1?'s':''):'nenhuma';
    $('#lobbyRooms').innerHTML=open.length?open.map(x=>`<div class="lobbyRoom"><div><div class="lobbyCode">${x.room}</div><div class="lobbyMeta">${timeLabel(x.minutes)} • aguardando adversário</div></div><button class="btn primary lobbyJoin" data-room="${x.room}">ENTRAR</button></div>`).join(''):'<div class="lobbyEmpty">Nenhuma sala aberta agora.<br>Crie uma e aguarde alguém entrar.</div>';
    document.querySelectorAll('.lobbyJoin').forEach(b=>b.onclick=()=>{room=b.dataset.room;role='p2';connect()});
  }catch{
    $('#lobbyCount').textContent='indisponível';
    $('#lobbyRooms').innerHTML='<div class="lobbyEmpty">Não foi possível carregar as salas.</div>';
  }
}

function home(){
  view('home');
  $('#resultModal').classList.add('hidden');
  const a=safe(localStorage.getItem('chessActive'));
  if(a&&getToken(a.room,a.role)&&Date.now()-a.at<86400000){
    $('#continueCard').classList.remove('hidden');
    $('#continueInfo').textContent='Sala '+a.room+' • '+timeLabel(a.mins);
    $('#continueBtn').onclick=()=>{room=a.room;role=a.role;mins=Number(a.mins);connect(true)};
  }else{
    $('#continueCard').classList.add('hidden');
    clearActive();
  }
  const h=safe(localStorage.getItem('chessHistory'))||[];
  if(h.length){
    $('#history').classList.remove('hidden');
    $('#historyList').innerHTML=h.slice(0,5).map(x=>`<div class="historyItem"><b>${x.outcome}</b> • ${x.color} • ${x.reason}<br><span class="muted">${timeLabel(x.minutes)} • ${new Date(x.at).toLocaleString('pt-BR')}</span></div>`).join('');
  }else $('#history').classList.add('hidden');
  loadLobby();
}

function invite(){return location.origin+location.pathname+'?room='+room}
function own(){return location.origin+location.pathname+'?room='+room+'&role='+role}
function waiting(){
  view('waiting');
  $('#roomCode').textContent=room;
  $('#waitingMeta').textContent=timeLabel(mins)+' • cores aleatórias';
  $('#qrcode').innerHTML='';
  new QRCode($('#qrcode'),{text:invite(),width:194,height:194});
}

function connect(re=false){
  clearTimeout(retry);
  const u=new URL(W);
  u.protocol='wss:';
  u.searchParams.set('room',room);
  u.searchParams.set('role',role);
  u.searchParams.set('minutes',String(mins));
  u.searchParams.set('token',getToken());
  if(re)$('#reconnect').classList.remove('hidden');
  ws=new WebSocket(u);
  ws.onopen=()=>{$('#reconnect').classList.add('hidden');setActive()};
  ws.onmessage=e=>handle(JSON.parse(e.data));
  ws.onclose=e=>{
    if(e.code===1008){
      $('#reconnect').classList.add('hidden');clearActive();alert(e.reason||'Sala indisponível');quit();home();
    }else if(room&&role&&!state?.result){
      $('#reconnect').classList.remove('hidden');
      retry=setTimeout(()=>connect(true),1500);
    }
  };
}

function send(type,data={}){if(ws?.readyState===1)ws.send(JSON.stringify({type,...data}))}
function quit(){
  clearTimeout(retry);
  const s=ws;
  ws=null;room=null;role=null;state=null;selected=null;legal=[];lastFen=null;lastMove=null;
  clearActive();history.replaceState(null,'',location.pathname);
  try{s?.close()}catch{}
}

function handle(m){
  if(m.type==='welcome'){
    if(m.token)localStorage.setItem(key(),m.token);
    color=m.color;
    if(m.state)apply(m.state);
    history.replaceState(null,'',own());
    m.state?.ready?showGame():role==='p1'&&waiting();
  }else if(m.type==='state'){
    apply(m.state);
    if(m.state.ready)showGame();
  }
}

function showGame(){view('game');render();renderGameMeta();requestWake()}

function apply(s){
  const prev=state,old=lastFen;
  state=s;
  color=s.colors?.[role]||color;
  if(Number.isFinite(s.minutes))mins=s.minutes;
  game.load(s.fen);
  lastMove=s.lastMove;
  lastFen=s.fen;
  setActive();
  if(old&&old!==s.fen){tone(game.in_check()?620:420);if(navigator.vibrate)navigator.vibrate(25)}
  render();renderGameMeta();clocks();labels();
  if(s.result){
    saveResult();clearActive();$('#status').textContent=s.result;result();
  }else{
    $('#resultModal').classList.add('hidden');
    $('#status').textContent=!s.started?(color==='w'?'SUA VEZ • faça o primeiro lance':'Aguardando as brancas'):s.turn===color?'SUA VEZ':'Vez do adversário';
  }
  if(prev?.round&&s.round!==prev.round){
    selected=null;legal=[];resultSaved=false;$('#resultModal').classList.add('hidden');render();renderGameMeta();
  }
}

function labels(){
  if(!color)return;
  $('#myLabel').textContent='Você • '+(color==='w'?'Brancas':'Pretas');
  $('#oppLabel').textContent='Adversário • '+(color==='w'?'Pretas':'Brancas');
  const off=state?.ready&&!state.connected?.[role==='p1'?'p2':'p1'];
  $('#opponent').classList.toggle('offline',off);
  $('#connection').textContent=off?'Adversário desconectado • aguardando reconexão':'Conectado';
}

function squares(){
  const a=[];
  if(color==='b'){for(let r=1;r<=8;r++)for(const f of'hgfedcba')a.push(f+r)}
  else for(let r=8;r>=1;r--)for(const f of'abcdefgh')a.push(f+r);
  return a;
}

function render(){
  const b=$('#board');if(!b)return;
  b.innerHTML='';
  const a=squares();let check;
  if(game.in_check())for(const s of a){const p=game.get(s);if(p?.type==='k'&&p.color===game.turn()){check=s;break}}
  a.forEach((s,i)=>{
    const f=s.charCodeAt(0)-97,r=+s[1],e=document.createElement('div');
    e.className='sq '+(((f+r)&1)?'light':'dark');
    if(selected===s)e.classList.add('selected');
    if(lastMove&&(lastMove.from===s||lastMove.to===s))e.classList.add('last');
    if(check===s)e.classList.add('check');
    if(legal.some(x=>x.to===s))e.classList.add(game.get(s)?'capture':'legal');
    const p=game.get(s);
    if(p){const z=document.createElement('span');z.className='piece '+(p.color==='w'?'whitePiece':'blackPiece');z.textContent=glyph[p.color][p.type];e.appendChild(z)}
    if(Math.floor(i/8)===7){const c=document.createElement('span');c.className='coord file';c.textContent=s[0];e.appendChild(c)}
    if(i%8===0){const c=document.createElement('span');c.className='coord rank';c.textContent=s[1];e.appendChild(c)}
    e.onclick=()=>clickSq(s);b.appendChild(e);
  });
}

function clickSq(s){
  if(!state?.ready||state.result||state.turn!==color)return;
  const p=game.get(s);
  if(!selected){if(p?.color===color){selected=s;legal=game.moves({square:s,verbose:true});render()}return}
  const m=legal.find(x=>x.to===s);
  if(m){
    if(m.flags.includes('p')){promo={from:selected,to:s};promotion();return}
    send('move',{from:selected,to:s,promotion:'q'});selected=null;legal=[];return;
  }
  if(p?.color===color){selected=s;legal=game.moves({square:s,verbose:true})}else{selected=null;legal=[]}
  render();
}

function promotion(){
  const x=$('#promoChoices');x.innerHTML='';
  for(const t of['q','r','b','n']){
    const b=document.createElement('button');b.className='btn';b.textContent=glyph[color][t];
    b.onclick=()=>{send('move',{...promo,promotion:t});$('#promo').classList.add('hidden');selected=null;legal=[]};x.appendChild(b);
  }
  $('#promo').classList.remove('hidden');
}

function describeMove(m){
  if(m.flags?.includes('k'))return 'Roque pequeno';
  if(m.flags?.includes('q'))return 'Roque grande';
  let text=`${pieceName[m.piece]||'Peça'} ${String(m.from).toUpperCase()} ${m.captured?'×':'→'} ${String(m.to).toUpperCase()}`;
  if(m.promotion)text+=` = ${pieceName[m.promotion]}`;
  if(m.san?.endsWith('#'))text+=' • xeque-mate';
  else if(m.san?.endsWith('+'))text+=' • xeque';
  return text;
}

function historyMarkup(){
  const moves=state?.moves||[];
  if(!moves.length)return '<div class="moveEmpty">Nenhuma jogada ainda.</div>';
  return moves.map(m=>`<div class="moveEntry ${m.color==='w'?'white':'black'}"><div class="moveNum">${Math.ceil(m.ply/2)}${m.color==='w'?'.':'...'} ${m.color==='w'?'Brancas':'Pretas'}</div>${describeMove(m)}</div>`).join('');
}

function captureMarkup(){
  const moves=state?.moves||[];
  const byWhite=moves.filter(m=>m.captured&&m.color==='w').map(m=>m.captured);
  const byBlack=moves.filter(m=>m.captured&&m.color==='b').map(m=>m.captured);
  const group=(title,types,c)=>`<div class="captureGroup"><div class="sideSub">${title}</div><div class="capturePieces">${types.length?types.map(t=>`<span class="piece capturedPiece ${c==='w'?'whitePiece':'blackPiece'}">${glyph[c][t]}</span>`).join(''):'<span class="captureEmpty">Nenhuma</span>'}</div></div>`;
  return group('Capturadas pelas Brancas',byWhite,'b')+group('Capturadas pelas Pretas',byBlack,'w');
}

function renderGameMeta(){
  if(!state)return;
  const mh=$('#moveHistory');if(mh){mh.innerHTML=historyMarkup();mh.scrollTop=mh.scrollHeight}
  const cp=$('#capturedPieces');if(cp)cp.innerHTML=captureMarkup();
}

function openAux(type){
  $('#auxTitle').textContent=type==='history'?'Histórico de jogadas':'Peças capturadas';
  $('#auxContent').innerHTML=type==='history'?historyMarkup():captureMarkup();
  $('#auxModal').classList.remove('hidden');
  if(type==='history')$('#auxContent').scrollTop=$('#auxContent').scrollHeight;
}

function live(){
  if(state?.minutes===0)return{w:null,b:null};
  let w=state?.whiteMs??mins*60000,b=state?.blackMs??mins*60000;
  if(state?.started&&!state.result&&state.turnStartedAt){const d=Date.now()-state.turnStartedAt;state.turn==='w'?w-=d:b-=d}
  return{w,b};
}
function fmt(m){if(m===null||m===undefined)return'∞';const s=Math.ceil(Math.max(0,m)/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function clocks(){
  if(!state)return;
  if(state.minutes===0){$('#myClock').textContent='∞';$('#oppClock').textContent='∞'}
  else{
    const t=live(),mine=color==='w'?t.w:t.b,opp=color==='w'?t.b:t.w;
    $('#myClock').textContent=fmt(mine);$('#oppClock').textContent=fmt(opp);
    if(state.started&&!state.result&&(t.w<=0||t.b<=0))send('sync');
  }
  $('#me').classList.toggle('active',state.turn===color&&!state.result);
  $('#opponent').classList.toggle('active',state.turn!==color&&!state.result);
}
setInterval(clocks,200);

function saveResult(){
  if(resultSaved)return;resultSaved=true;
  const win=(state.result.startsWith('Brancas')&&color==='w')||(state.result.startsWith('Pretas')&&color==='b');
  const draw=state.result.startsWith('Empate');
  const reason=state.result.includes('—')?state.result.split('—')[1].trim():state.result;
  const h=safe(localStorage.getItem('chessHistory'))||[];
  h.unshift({outcome:draw?'Empate':win?'Vitória':'Derrota',color:color==='w'?'Brancas':'Pretas',reason,minutes:state.minutes,at:Date.now()});
  localStorage.setItem('chessHistory',JSON.stringify(h.slice(0,10)));
}

function result(){
  const t=live(),mine=color==='w'?t.w:t.b,opp=color==='w'?t.b:t.w;
  const win=(state.result.startsWith('Brancas')&&color==='w')||(state.result.startsWith('Pretas')&&color==='b');
  const draw=state.result.startsWith('Empate');
  $('#resultTitle').textContent=draw?'EMPATE':win?'VITÓRIA':'DERROTA';
  $('#resultText').textContent=state.result;
  $('#resultStats').innerHTML=state.minutes===0?`Você • ${color==='w'?'Brancas':'Pretas'} <b>Sem limite</b><br>Adversário • ${color==='w'?'Pretas':'Brancas'} <b>Sem limite</b>`:`Você • ${color==='w'?'Brancas':'Pretas'} <b>${fmt(mine)}</b><br>Adversário • ${color==='w'?'Pretas':'Brancas'} <b>${fmt(opp)}</b>`;
  $('#rematchInfo').textContent=state.rematch?.[role]?'Aguardando o adversário aceitar…':'';
  $('#rematch').disabled=!!state.rematch?.[role];
  $('#resultModal').classList.remove('hidden');releaseWake();
}

function tone(f){
  if(!soundOn)return;
  try{const A=window.AudioContext||window.webkitAudioContext,a=new A(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=f;g.gain.value=.035;o.start();g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.stop(a.currentTime+.13)}catch{}
}
function sound(){$('#sound').textContent=soundOn?'🔊':'🔇'}
async function requestWake(){if('wakeLock'in navigator&&state?.ready&&!state.result)try{wake=await navigator.wakeLock.request('screen')}catch{}}
async function releaseWake(){try{await wake?.release()}catch{}wake=null}

function bindUI(){
  setupTimeButtons();
  $('#create').onclick=()=>{role='p1';room=crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0,6).toUpperCase().padStart(6,'0');view('waiting');connect()};
  $('#showJoin').onclick=()=>$('#joinBox').classList.toggle('hidden');
  $('#joinGo').onclick=()=>{room=$('#roomInput').value.trim().toUpperCase();if(room){role='p2';connect()}};
  $('#forgetBtn').onclick=()=>{clearActive();$('#continueCard').classList.add('hidden')};
  $('#copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(invite());alert('Convite copiado!')}catch{prompt('Copie:',invite())}};
  $('#cancelRoom').onclick=()=>{quit();home()};
  $('#resign').onclick=()=>$('#confirmLeave').classList.remove('hidden');
  $('#keepPlaying').onclick=()=>$('#confirmLeave').classList.add('hidden');
  $('#confirmResign').onclick=()=>{$('#confirmLeave').classList.add('hidden');send('resign')};
  $('#rematch').onclick=()=>{send('rematch');$('#rematch').disabled=true;$('#rematchInfo').textContent='Aguardando o adversário aceitar…'};
  $('#goHome').onclick=()=>{quit();home()};
  $('#sound').onclick=()=>{soundOn=!soundOn;localStorage.setItem('chessSound',soundOn?'1':'0');sound()};
  $('#showHistoryMobile').onclick=()=>openAux('history');
  $('#showCapturedMobile').onclick=()=>openAux('captured');
  $('#closeAux').onclick=()=>$('#auxModal').classList.add('hidden');
  sound();
}

bindUI();
const q=new URLSearchParams(location.search),inv=q.get('room'),sr=q.get('role');
if(inv){room=inv.toUpperCase();role=sr&&getToken(room,sr)?sr:'p2';setTimeout(()=>connect(true),50)}else home();
setInterval(loadLobby,3000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&room&&role){if(!ws||ws.readyState>1)connect(true);requestWake()}else if(document.visibilityState==='visible')loadLobby()});
window.addEventListener('online',()=>{if(room&&role&&(!ws||ws.readyState>1))connect(true);else loadLobby()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/xadrez/sw.js',{scope:'/xadrez/'}).catch(()=>{});
