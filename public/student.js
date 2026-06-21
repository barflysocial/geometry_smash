const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let state = {
  code: (params.get('code') || localStorage.geoCode || '').toUpperCase(),
  playerId: localStorage.geoPlayerId || '',
  question: null,
  selectedAnswer: '',
  timerHandle: null,
  clockOffset: 0,
  questionStartedAt: null,
  priorQuestionSeconds: 0,
  testStartedAt: null
};
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
    $('questionTimer').textContent = fmt(Number(state.priorQuestionSeconds||0) + elapsedFrom(state.questionStartedAt));
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
    history.replaceState(null,'',`/student?code=${encodeURIComponent(code)}`);
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
  state.question=q; state.selectedAnswer=q.selectedAnswer || ''; $('quizError').textContent='';
  $('topicPill').textContent=q.topic; $('skillPill').textContent=q.skill; $('countPill').textContent=`${q.index+1} of ${q.total}`; $('answeredPill').textContent=`Answered: ${q.answeredCount || 0}/${q.total}`;
  $('progressBar').style.width=`${Math.round(((q.index+1)/q.total)*100)}%`; $('questionText').textContent=q.question;
  renderMusic(q.music);
  const choicesBox=$('choicesBox'); choicesBox.innerHTML='';
  (q.choices||[]).forEach((choice, idx)=>{
    const btn=document.createElement('button');
    btn.type='button'; btn.className='choice';
    btn.textContent=`${String.fromCharCode(65+idx)}. ${choice.label}`;
    if(choice.label === state.selectedAnswer) btn.classList.add('selected');
    btn.onclick=()=>{
      state.selectedAnswer=choice.label;
      document.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));
      btn.classList.add('selected');
    };
    choicesBox.appendChild(btn);
  });
  $('backBtn').disabled = q.index <= 0;
  $('nextBtn').disabled = q.index >= q.total - 1;
  state.questionStartedAt = q.questionStartedAt;
  state.priorQuestionSeconds = Number(q.priorQuestionSeconds || 0);
  state.testStartedAt = q.playerStartedAt;
  show('quizCard'); startTrackingTimers();
}
async function navigateTo(targetIndex){
  if(!state.question) return;
  $('quizError').textContent='';
  try{
    const data=await api('/api/student/navigate',{method:'POST',body:JSON.stringify({code:state.code,playerId:state.playerId,questionId:state.question.id,answer:state.selectedAnswer,targetIndex})});
    if(data.session) syncClock(data.session);
    renderQuestion(data.question);
  }catch(e){ $('quizError').textContent=e.message; }
}
async function finishTest(){
  if(!state.question)return;
  const unansweredText = state.question.answeredCount < state.question.total ? `\n\nSome questions may be unanswered. Submit anyway?` : '';
  if(!confirm(`Submit this test now? You will not be able to change answers after submitting.${unansweredText}`)) return;
  $('quizError').textContent='';
  try{
    const data=await api('/api/student/complete',{method:'POST',body:JSON.stringify({code:state.code,playerId:state.playerId,questionId:state.question.id,answer:state.selectedAnswer})});
    if(data.session) syncClock(data.session);
    renderDone(data.score);
  }catch(e){ $('quizError').textContent=e.message; }
}
function renderDone(score){
  stopTimers();
  $('scoreText').textContent=`${score.correct}/${score.total} (${score.percent}%)`;
  $('profText').textContent=proficiency(score.percent);
  $('testTimeText').textContent=fmt(score.testSeconds);
  $('avgTimeText').textContent=fmt(score.avgAnswerSeconds);
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
      ${renderStaffMarkup(r.music)}
      <p><b>${esc(r.question)}</b></p>
      <p>Your answer: <span class="bad">${esc(r.selected || 'Not answered')}</span></p>
      <p>Correct answer: <span class="good">${esc(r.correctAnswer)}</span></p>
      <p class="muted small"><b>Explanation:</b> ${esc(r.explanation)}</p>
    </div>`).join('');
}
function renderMusic(music){
  const panel=$('musicPanel'); const staff=$('staffBox'); const play=$('playSoundBtn'); const hint=$('audioHint');
  const questionText = String(state.question?.question || '');
  const hasStaff = !!(music && Array.isArray(music.notes) && music.notes.length);
  const hasAudio = !!(music && music.audio && Array.isArray(music.audio.notes) && music.audio.notes.length) || /play\s+sound|listen/i.test(questionText);
  if(!music && !hasAudio){
    panel.classList.add('hidden');
    staff.innerHTML='';
    play.classList.add('hidden');
    if(hint) hint.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  staff.innerHTML = hasStaff ? renderStaffMarkup(music) : '';
  // Any question that asks the student to listen must always show a visible Play Sound button.
  play.classList.toggle('hidden', !hasAudio);
  if(hasAudio){
    play.textContent = '▶ Play Sound';
    play.disabled = false;
    if(hint) hint.classList.remove('hidden');
  } else if(hint) {
    hint.classList.add('hidden');
  }
}
function noteToY(note){
  const order=['C','D','E','F','G','A','B'];
  const m=String(note||'C4').match(/^([A-G])([#b]?)(\d)$/); if(!m)return 140;
  const diatonic = (Number(m[3])-4)*7 + order.indexOf(m[1]);
  const e4 = 2; // E4 bottom line
  return 120 - (diatonic - e4)*10;
}
function renderStaffMarkup(music){
  if(!music || !music.notes) return '';
  const notes = music.notes || [];
  const width = Math.max(360, 90 + notes.length*58);
  const lines = [40,60,80,100,120].map(y=>`<line x1="45" x2="${width-20}" y1="${y}" y2="${y}"/>`).join('');
  const noteEls = notes.map((n,i)=>{ const x=90+i*58; const y=noteToY(n.note); const stemUp=y>=80; const stem=`<line x1="${x+11}" y1="${y}" x2="${x+11}" y2="${stemUp?y-48:y+48}" class="stem"/>`; const ledger=(y>120?`<line x1="${x-18}" x2="${x+18}" y1="140" y2="140"/>`: y<40?`<line x1="${x-18}" x2="${x+18}" y1="20" y2="20"/>`:''); return `${ledger}<ellipse cx="${x}" cy="${y}" rx="12" ry="8" transform="rotate(-18 ${x} ${y})"/>${stem}<text x="${x-7}" y="160" class="note-label">${esc(n.label||'')}</text>`; }).join('');
  return `<svg class="staff-svg" viewBox="0 0 ${width} 180" role="img" aria-label="Treble clef staff"><rect width="${width}" height="180" rx="18"/><g class="staff-lines">${lines}</g><text x="18" y="116" class="clef">𝄞</text><g class="notes">${noteEls}</g></svg>`;
}
function noteFreq(note){
  const m=String(note||'C4').match(/^([A-G])([#b]?)(\d)$/); if(!m)return 261.63;
  const semis={C:0,D:2,E:4,F:5,G:7,A:9,B:11}; let midi=(Number(m[3])+1)*12+semis[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);
  return 440*Math.pow(2,(midi-69)/12);
}
async function playMusic(){
  const music=state.question?.music || {};
  let audioNotes = music.audio?.notes;
  // Fallback: if a staff question asks for sound but only has visual notes, play those notes.
  if((!audioNotes || !audioNotes.length) && Array.isArray(music.notes) && music.notes.length){
    audioNotes = music.notes.map(n => ({ note: n.note || 'C4', beats: n.beats || 1 }));
  }
  if(!audioNotes || !audioNotes.length){
    return alert('This question is missing its audio data. Please tell the host to use the fixed build.');
  }
  const AudioContext=window.AudioContext||window.webkitAudioContext; if(!AudioContext) return alert('Audio is not supported in this browser.');
  const ctx=new AudioContext();
  if(ctx.state === 'suspended') await ctx.resume();
  const tempo=music.audio?.tempo||96; let t=ctx.currentTime+0.08;
  for(const n of audioNotes){
    const dur=(60/tempo)*(n.beats||1);
    const osc=ctx.createOscillator(); const gain=ctx.createGain(); osc.type='sine'; osc.frequency.value=noteFreq(n.note||'C4');
    gain.gain.setValueAtTime(0.0001,t); gain.gain.exponentialRampToValueAtTime(0.22,t+0.03); gain.gain.exponentialRampToValueAtTime(0.0001,t+Math.max(0.08,dur-0.03));
    osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t+dur); t += dur;
  }
}
function esc(x){ return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
$('joinBtn').onclick=join; $('refreshState').onclick=loadState; $('backBtn').onclick=()=>navigateTo(state.question.index-1); $('nextBtn').onclick=()=>navigateTo(state.question.index+1); $('finishBtn').onclick=finishTest; $('playSoundBtn').onclick=playMusic; loadState(); setInterval(()=>{ if(!document.hidden && !['quizCard','doneCard'].some(id=>!$(id).classList.contains('hidden'))) loadState(); },5000);
