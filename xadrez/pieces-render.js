(()=>{
  const MAP={
    '♔':['w','k'],'♕':['w','q'],'♖':['w','r'],'♗':['w','b'],'♘':['w','n'],'♙':['w','p'],
    '♚':['b','k'],'♛':['b','q'],'♜':['b','r'],'♝':['b','b'],'♞':['b','n'],'♟':['b','p']
  };
  const BASE='https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/';
  const pieceUrl=(color,type)=>`${BASE}${color}${type.toUpperCase()}.svg`;

  function installStyle(){
    if(document.getElementById('merida-piece-style'))return;
    const s=document.createElement('style');
    s.id='merida-piece-style';
    s.textContent=`
      .piece>.meridaPiece{width:92%;height:92%;display:block;object-fit:contain;pointer-events:none;user-select:none;filter:drop-shadow(0 2px 1px #0005)}
      .capturedPiece>.meridaPiece{width:100%;height:100%;filter:none}
      #promoChoices button .meridaPiece{width:52px;height:52px;filter:drop-shadow(0 2px 1px #0004)}
    `;
    document.head.appendChild(s);
  }

  function makeImg(color,type){
    const img=document.createElement('img');
    img.className='meridaPiece';
    img.src=pieceUrl(color,type);
    img.alt='';
    img.draggable=false;
    img.decoding='async';
    img.dataset.color=color;
    img.dataset.type=type;
    return img;
  }

  function upgradePiece(el){
    if(!el||el.querySelector(':scope > img.meridaPiece'))return;
    const match=MAP[(el.textContent||'').trim()];
    if(!match)return;
    el.textContent='';
    el.appendChild(makeImg(...match));
    el.dataset.vector='merida';
  }

  function upgradePromo(el){
    if(!el||el.querySelector('img.meridaPiece'))return;
    const match=MAP[(el.textContent||'').trim()];
    if(!match)return;
    el.textContent='';
    el.appendChild(makeImg(...match));
    el.dataset.vector='merida';
  }

  function upgrade(root=document){
    installStyle();
    if(root.nodeType===1){
      if(root.matches?.('.piece'))upgradePiece(root);
      if(root.matches?.('#promoChoices button'))upgradePromo(root);
    }
    root.querySelectorAll?.('.piece').forEach(upgradePiece);
    root.querySelectorAll?.('#promoChoices button').forEach(upgradePromo);
  }

  new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType===1)upgrade(node);
      }
    }
  }).observe(document.documentElement,{childList:true,subtree:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>upgrade());
  else upgrade();
})();