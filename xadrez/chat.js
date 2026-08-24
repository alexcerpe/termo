(()=>{
  const $=s=>document.querySelector(s);
  const MAX_LEN=200;

  function supported(){
    return Array.isArray(state?.messages);
  }

  function getMessages(){
    return supported()?state.messages:[];
  }

  function setAvailability(){
    const on=supported();
    const section=$('.chatSection');
    const divider=$('.sideDivider');
    const mobile=$('#showChatMobile');
    if(section)section.classList.toggle('hidden',!on);
    if(divider)divider.classList.toggle('hidden',!on);
    if(mobile)mobile.classList.toggle('hidden',!on);
    return on;
  }

  function renderMessages(container){
    if(!container)return;
    const messages=getMessages();
    container.innerHTML='';
    if(!messages.length){
      const empty=document.createElement('div');
      empty.className='chatEmpty';
      empty.textContent='Nenhuma mensagem ainda.';
      container.appendChild(empty);
      return;
    }
    for(const msg of messages){
      const mine=msg.role===role;
      const item=document.createElement('div');
      item.className='chatMessage '+(mine?'mine':'theirs');

      const author=document.createElement('div');
      author.className='chatAuthor';
      author.textContent=mine?'Você':'Adversário';

      const text=document.createElement('div');
      text.className='chatText';
      text.textContent=String(msg.text||'');

      item.append(author,text);
      container.appendChild(item);
    }
    container.scrollTop=container.scrollHeight;
  }

  function submit(input){
    if(!input||!supported()||!state?.ready||state.result)return;
    const text=input.value.trim().slice(0,MAX_LEN);
    if(!text)return;
    send('chat',{text});
    input.value='';
    input.focus();
  }

  function wireComposer(root){
    const input=root?.querySelector('.chatInput');
    const button=root?.querySelector('.chatSend');
    if(!input||!button)return;
    button.onclick=()=>submit(input);
    input.onkeydown=e=>{
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        submit(input);
      }
    };
  }

  function renderDesktop(){
    if(!setAvailability())return;
    const log=$('#chatMessages');
    renderMessages(log);
    const input=$('#chatInput');
    const button=$('#chatSend');
    const disabled=!state?.ready||!!state?.result;
    if(input)input.disabled=disabled;
    if(button)button.disabled=disabled;
  }

  function buildMobileChat(){
    const root=document.createElement('div');
    root.className='chatPanel mobileChatPanel';

    const log=document.createElement('div');
    log.className='chatMessages';
    root.appendChild(log);

    const composer=document.createElement('div');
    composer.className='chatComposer';

    const input=document.createElement('input');
    input.className='chatInput';
    input.maxLength=MAX_LEN;
    input.autocomplete='off';
    input.placeholder='Digite uma mensagem…';

    const button=document.createElement('button');
    button.className='btn primary chatSend';
    button.type='button';
    button.textContent='Enviar';

    composer.append(input,button);
    root.appendChild(composer);
    wireComposer(root);
    renderMessages(log);

    const disabled=!state?.ready||!!state?.result;
    input.disabled=disabled;
    button.disabled=disabled;
    return root;
  }

  function openChat(){
    if(!supported())return;
    $('#auxTitle').textContent='Chat';
    const content=$('#auxContent');
    content.innerHTML='';
    content.appendChild(buildMobileChat());
    $('#auxModal').classList.remove('hidden');
  }

  const originalRenderGameMeta=renderGameMeta;
  renderGameMeta=function(){
    originalRenderGameMeta();
    renderDesktop();
    const mobileLog=$('#auxModal:not(.hidden) .mobileChatPanel .chatMessages');
    if(mobileLog)renderMessages(mobileLog);
  };

  wireComposer(document);
  $('#showChatMobile').onclick=openChat;
  setAvailability();
})();
