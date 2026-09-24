const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
const $ = id => document.getElementById(id);
let screen = 'home', role = null, currentTeam = null;
const show = name => { document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden')); $(name).classList.remove('hidden'); screen = name; };
function toast(message){ $('toast').textContent=message; $('toast').style.display='block'; clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>$('toast').style.display='none',3500); }
function renderInputs(){ $('team-inputs').innerHTML=Array.from({length:Number($('team-count').value)},(_,i)=>`<input class="team-name" placeholder="Team ${i+1} name" maxlength="30"><input class="team-members" type="number" min="1" max="99" value="${i+2}" aria-label="Team ${i+1} members">`).join(''); }
function send(data){ if(socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(data)); else toast('Connecting to game server…'); }
function renderState(state){
  if(role==='host'){
    $('room-code').textContent=state.roomCode; $('timer').textContent=state.remaining;
    $('team-list').innerHTML=state.teams.map(t=>`<div class="team-card" style="border-left-color:${t.color}"><span class="status">${t.connected?'● Online':'○ Waiting'}</span><strong>${escapeHtml(t.name)}</strong><small>${t.members} member${t.members===1?'':'s'} · code in setup</small></div>`).join('');
    $('buzzer-list').innerHTML=state.buzzerOrder.length?state.buzzerOrder.map((b,i)=>`<li><b style="color:${b.color}">${i+1}. ${escapeHtml(b.name)}</b></li>`).join(''):'<li class="empty">No buzzes yet — start a round!</li>';
    $('start-btn').disabled=state.started; $('start-btn').textContent=state.started?'Round in progress…':'Start 20 second round ▶';
  } else if(currentTeam){ $('buzzer-message').textContent=state.started?(state.buzzerOrder.length?'A team has buzzed! Wait for the next round.':'Tap the button first!'):'Wait for the host to start the round.'; $('buzz-btn').disabled=!state.started||state.buzzerOrder.length>0||currentTeam.buzzed; }
}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
$('team-count').addEventListener('change',renderInputs); renderInputs();
document.querySelectorAll('[data-screen]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.screen)));
document.querySelectorAll('.back').forEach(button=>button.addEventListener('click',()=>show('home')));
$('create-btn').addEventListener('click',()=>{const names=[...document.querySelectorAll('.team-name')],members=[...document.querySelectorAll('.team-members')];send({type:'create',teams:names.map((input,i)=>({name:input.value.trim()||`Team ${i+1}`,members:members[i].value}))});});
$('join-btn').addEventListener('click',()=>{const value=$('team-code').value.trim();if(!/^\d{5}$/.test(value))return toast('Enter a valid 5-digit team code.');send({type:'join',teamCode:value});});
$('start-btn').addEventListener('click',()=>send({type:'start'})); $('reset-btn').addEventListener('click',()=>send({type:'reset'})); $('buzz-btn').addEventListener('click',()=>send({type:'buzz'}));
socket.addEventListener('open',()=>{ if(screen==='home') document.querySelector('.live-pill').innerHTML='<i></i> Server connected'; });
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.type==='error')return toast(message.message);if(message.type==='created'){role='host';show('dashboard');$('room-code').textContent=message.room.roomCode;toast('Room created! Share the team codes with players.');message.teamCodes.forEach((item,i)=>{const card=document.querySelectorAll('.team-card')[i];});renderState(message.room);$('team-list').innerHTML=message.room.teams.map((t,i)=>`<div class="team-card" style="border-left-color:${t.color}"><span class="status">Code: <b>${message.teamCodes[i].code}</b></span><strong>${escapeHtml(t.name)}</strong><small>${t.members} member${t.members===1?'':'s'} · ${t.color}</small></div>`).join('');}if(message.type==='joined'){role='team';currentTeam=message.team;show('buzzer');$('buzzer-name').textContent=currentTeam.name;$('buzz-btn').style.color=currentTeam.color;renderState(message.room);toast(`Connected as ${currentTeam.name}`);}if(message.type==='state')renderState(message.state);if(message.type==='winner'&&role==='team')toast(`${message.winner.name} buzzed first!`);});
socket.addEventListener('close',()=>toast('Disconnected from the game server.'));
