const $ = id => document.getElementById(id);
let state = { code: localStorage.geoCode || '', playerId: localStorage.geoPlayerId || '', question: null, selectedAnswer: '', timerHandle: null, clockOffset: 0, questionStartedAt: null, testStartedAt: null };
$('sessionCode').value = state.code;
$('studentName').value = localStorage.geoStudentName || '';
function show(id){ ['joinCard','waitingCard','quizCard','doneCard'].forEach(x=>$(x).classList.add('hidden')); $(id).classList.remove('hidden'); }
async function api(url, opts={}){ const res=await fetch(url,{headers:{'Content-Type':'application/json'},...opts}); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Request failed'); return data; }
function proficiency(p){ if(p>=90)return 'Advanced'; if(p>=80)return 'Proficient'; if(p>=70)return 'Approaching'; return 'Needs Review'; }
function fmt(seconds){ seconds=Math.max(0, Math.floor(seconds||0)); const h=Math.floor(seconds/3600); const m=Math.floor((seconds%3600)/60); const s=seconds%60; return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`; }
function stopTimers(){ if(state.timerHandle) clearInterval(state.timerHandle); state.timerHandle=null; }
function syncClock(session){ const serverNow = new Date(session.serverNow || Date.now()).getTime(); state.clockOffset = serverNow - Date.now(); }
function elapsedFrom(iso){ if(!iso)return 0; return Math.max(0, (Date.now() + state.clockOffset - new Date(iso).getTime()) / 1000); }
function startTrackingTimers(){
  stopTimers();
  const tick = () => {
    $('questionTimer').textContent = fmt(elapsedFrom(state.questionStartedAt));
    $('gameTimer').textContent = fmt(elapsedFrom(state.testStartedAt));
  };
  tick(); state.timerHandle=setInterval(tick, 500);
}
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
    syncClock(data.session);
    $('statusPill').textContent=`Code ${state.code}`;
    if(data.player.completed || data.session.status==='closed'){ renderDone(data.score); return; }
    if(data.session.status!=='active'){
      stopTimers(); $('waitingCode').textContent=`Code ${state.code}`; $('waitingName').textContent=data.player.name; show('waitingCard'); return;
    }
    renderQuestion(data.question);
  }catch(e){ stopTimers(); show('joinCard'); $('joinError').textContent=e.message; }
}
function renderQuestion(q){
  state.question=q; state.selectedAnswer=''; $('submitBtn').disabled=true; $('quizError').textContent='';
  $('topicPill').textContent=q.topic; $('skillPill').textContent=q.skill; $('countPill').textContent=`${q.index+1} of ${q.total}`;
  $('progressBar').style.width=`${Math.round((q.index/q.total)*100)}%`; $('questionText').textContent=q.question;
  const choicesBox=$('choicesBox'); choicesBox.innerHTML='';
  (q.choices||[]).forEach((choice, idx)=>{
    const btn=document.createElement('button');
    btn.type='button'; btn.className='choice';
    btn.textContent=`${String.fromCharCode(65+idx)}. ${choice.label}`;
    btn.onclick=()=>{
      state.selectedAnswer=choice.label;
      document.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));
      btn.classList.add('selected');
      $('submitBtn').disabled=false;
    };
    choicesBox.appendChild(btn);
  });
  state.questionStartedAt = q.questionStartedAt;
  state.testStartedAt = q.playerStartedAt;
  show('quizCard'); startTrackingTimers();
}
async function submitAnswer(){
  if(!state.question)return;
  const answer=state.selectedAnswer;
  if(!answer)return;
  $('submitBtn').disabled=true; document.querySelectorAll('.choice').forEach(x=>x.disabled=true); $('quizError').textContent='';
  try{
    const data=await api('/api/student/answer',{method:'POST',body:JSON.stringify({code:state.code,playerId:state.playerId,questionId:state.question.id,answer})});
    if(data.session) syncClock(data.session);
    if(data.completed) renderDone(data.score); else renderQuestion(data.nextQuestion);
  }catch(e){ $('quizError').textContent=e.message; $('submitBtn').disabled=false; document.querySelectorAll('.choice').forEach(x=>x.disabled=false); }
}
function renderDone(score){
  stopTimers();
  $('scoreText').textContent=`${score.correct}/${score.total} (${score.percent}%)`;
  $('profText').textContent=proficiency(score.percent);
  $('testTimeText').textContent=fmt(score.testSeconds);
  $('avgTimeText').textContent=fmt(score.avgAnswerSeconds);
  $('progressBar').style.width='100%';
  renderMissedReview(score.missedRows || []);
  show('doneCard');
}
function renderMissedReview(rows){
  const box=$('missedReview');
  if(!box) return;
  if(!rows.length){
    box.innerHTML='<div class="card goodReview"><h2>No Missed Questions</h2><p>You did not miss any questions on this test.</p></div>';
    return;
  }
  box.innerHTML=`<h2>Review Missed Questions Only</h2><p class="muted">These explanations are shown only after submission.</p>` + rows.map(r=>`
    <div class="missed-card">
      <div class="row"><span class="pill">#${r.index}</span><span class="pill">${esc(r.topic)}</span><span class="pill">${esc(r.skill)}</span><span class="pill">Time: ${r.answerSeconds==null?'Not answered':fmt(r.answerSeconds)}</span></div>
      <p><b>${esc(r.question)}</b></p>
      <p>Your answer: <span class="bad">${esc(r.selected || 'Not answered')}</span></p>
      <p>Correct answer: <span class="good">${esc(r.correctAnswer)}</span></p>
      <p class="muted small"><b>Explanation:</b> ${esc(r.explanation)}</p>
    </div>`).join('');
}
function esc(x){ return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
$('joinBtn').onclick=join; $('refreshState').onclick=loadState; $('submitBtn').onclick=submitAnswer; loadState(); setInterval(()=>{ if(!document.hidden && !['quizCard','doneCard'].some(id=>!$(id).classList.contains('hidden'))) loadState(); },5000);
