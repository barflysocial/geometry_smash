const $ = id => document.getElementById(id);
let state = { code: localStorage.geoCode || '', playerId: localStorage.geoPlayerId || '', question: null };
$('sessionCode').value = state.code;
$('studentName').value = localStorage.geoStudentName || '';
function show(id){ ['joinCard','waitingCard','quizCard','doneCard'].forEach(x=>$(x).classList.add('hidden')); $(id).classList.remove('hidden'); }
async function api(url, opts={}){ const res=await fetch(url,{headers:{'Content-Type':'application/json'},...opts}); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Request failed'); return data; }
function proficiency(p){ if(p>=90)return 'Advanced'; if(p>=80)return 'Proficient'; if(p>=70)return 'Approaching'; return 'Needs Review'; }
async function join(){
  $('joinError').textContent='';
  try{
    const name=$('studentName').value.trim(); const code=$('sessionCode').value.trim().toUpperCase();
    const data=await api('/api/student/join',{method:'POST',body:JSON.stringify({name,code,playerId:state.playerId})});
    state.code=code; state.playerId=data.player.id; localStorage.geoCode=code; localStorage.geoPlayerId=state.playerId; localStorage.geoStudentName=name;
    await loadState();
  }catch(e){ $('joinError').textContent=e.message; }
}
async function loadState(){
  if(!state.code||!state.playerId){ show('joinCard'); return; }
  try{
    const data=await api(`/api/student/state?code=${encodeURIComponent(state.code)}&playerId=${encodeURIComponent(state.playerId)}`);
    $('statusPill').textContent=`Code ${state.code}`;
    if(data.player.completed){ renderDone(data.score); return; }
    if(data.session.status!=='active'){
      $('waitingCode').textContent=`Code ${state.code}`; $('waitingName').textContent=data.player.name; show('waitingCard'); return;
    }
    renderQuestion(data.question);
  }catch(e){ show('joinCard'); $('joinError').textContent=e.message; }
}
function renderQuestion(q){
  state.question=q; $('submitBtn').disabled=true; $('quizError').textContent='';
  $('topicPill').textContent=q.topic; $('skillPill').textContent=q.skill; $('countPill').textContent=`${q.index+1} of ${q.total}`;
  $('progressBar').style.width=`${Math.round((q.index/q.total)*100)}%`; $('questionText').textContent=q.question;
  const input=$('answerInput'); input.value=''; input.oninput=()=>{ $('submitBtn').disabled=input.value.trim().length===0; }; setTimeout(()=>input.focus(),50);
  show('quizCard');
}
async function submitAnswer(){
  const answer=$('answerInput').value.trim();
  if(!answer||!state.question)return;
  $('submitBtn').disabled=true; $('quizError').textContent='';
  try{
    const data=await api('/api/student/answer',{method:'POST',body:JSON.stringify({code:state.code,playerId:state.playerId,questionId:state.question.id,answer})});
    if(data.completed) renderDone(data.score); else renderQuestion(data.nextQuestion);
  }catch(e){ $('quizError').textContent=e.message; $('submitBtn').disabled=false; }
}
function renderDone(score){ $('scoreText').textContent=`${score.correct}/${score.total} (${score.percent}%)`; $('profText').textContent=proficiency(score.percent); $('progressBar').style.width='100%'; show('doneCard'); }
$('joinBtn').onclick=join; $('refreshState').onclick=loadState; $('submitBtn').onclick=submitAnswer; $('answerInput').addEventListener('keydown',e=>{ if(e.key==='Enter' && !$('submitBtn').disabled) submitAnswer(); }); loadState(); setInterval(()=>{ if(!document.hidden && !['quizCard','doneCard'].some(id=>!$(id).classList.contains('hidden'))) loadState(); },5000);
