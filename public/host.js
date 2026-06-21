const $ = id => document.getElementById(id);
let topics=[], courses=[], host={code:localStorage.geoHostCode||'',pin:localStorage.geoHostPin||''}, data=null, timerHandle=null;
async function api(url,opts={}){ const res=await fetch(url,{headers:{'Content-Type':'application/json'},...opts}); const d=await res.json(); if(!res.ok) throw new Error(d.error||'Request failed'); return d; }
function showSession(){ $('setupCard').classList.add('hidden'); $('sessionCard').classList.remove('hidden'); }
function showSetup(){ $('setupCard').classList.remove('hidden'); $('sessionCard').classList.add('hidden'); }
async function loadTopics(){ const payload=await api('/api/topics'); courses=payload.courses||[{slug:'geometry',name:'Geometry Honors'}]; topics=payload.topics||payload; renderCourses(); renderTopics(); }
function renderCourses(){ const sel=$('courseSelect'); if(!sel)return; sel.innerHTML=''; courses.forEach(c=>{ const opt=document.createElement('option'); opt.value=c.slug; opt.textContent=c.name; sel.appendChild(opt); }); sel.onchange=()=>{ const c=courses.find(x=>x.slug===sel.value); $('title').value=(c?.name||'Math')+' Challenge'; renderTopics(); }; }
function renderTopics(){ $('topicList').innerHTML=''; const course=$('courseSelect')?.value || courses[0]?.slug; const allowed=new Set((courses.find(c=>c.slug===course)?.topicSlugs)||topics.filter(t=>t.course===course).map(t=>t.slug)); topics.filter(t=>allowed.has(t.slug)).forEach(t=>{ const label=document.createElement('label'); label.className='check'; label.innerHTML=`<input type="checkbox" value="${t.slug}"><span><b>${t.name}</b><br><span class="muted small">${t.count} questions</span></span>`; $('topicList').appendChild(label); }); }
function selectedTopics(){ return [...document.querySelectorAll('#topicList input:checked')].map(x=>x.value); }
function fmt(seconds){ seconds=Math.max(0, Math.floor(seconds||0)); const h=Math.floor(seconds/3600); const m=Math.floor((seconds%3600)/60); const s=seconds%60; return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`; }
async function createSession(){
  $('setupError').textContent='';
  try{
    const topicSlugs=selectedTopics(); if(topicSlugs.length===0) throw new Error('Select at least one topic.');
    const payload={course:$('courseSelect')?.value||'geometry',title:$('title').value.trim(),hostPin:$('hostPin').value.trim(),questionCount:Number($('questionCount').value),topicSlugs};
    const d=await api('/api/host/session',{method:'POST',body:JSON.stringify(payload)});
    host.code=d.session.code; host.pin=d.hostPin; localStorage.geoHostCode=host.code; localStorage.geoHostPin=host.pin; await refresh();
  }catch(e){ $('setupError').textContent=e.message; }
}
async function refresh(){
  if(!host.code||!host.pin){ showSetup(); return; }
  try{ data=await api(`/api/host/session?code=${encodeURIComponent(host.code)}&pin=${encodeURIComponent(host.pin)}`); renderSession(); }catch(e){ showSetup(); $('setupError').textContent=e.message; }
}
function renderSession(){
  showSession(); const s=data.session; $('hostStatus').textContent=`Code ${s.code}`; $('codePill').textContent=`Student Code: ${s.code}`; $('pinPill').textContent=`Host PIN: ${data.hostPin}`; $('sessionStatusPill').textContent=s.status.toUpperCase(); $('sessionTitle').textContent=s.title; if(s.courseName){ $('sessionStatusPill').textContent=s.status.toUpperCase()+' • '+s.courseName; } $('playerCount').textContent=data.players.length; $('qCount').textContent=s.questionCount; const url=`${location.origin}/student?code=${encodeURIComponent(s.code)}`; $('joinLink').textContent=`${url}`; const qr=$('qrImg'); if(qr) qr.src=`/api/qr?code=${encodeURIComponent(s.code)}&t=${Date.now()}`; updateElapsedTimer(); renderPlayers(); renderAnswers(); renderSkills(); }
function updateElapsedTimer(){
  if(!data) return; const s=data.session; if(timerHandle) clearInterval(timerHandle);
  const serverNow = new Date(s.serverNow || Date.now()).getTime(); const offset = serverNow - Date.now();
  const startedAt = s.gameStartedAt ? new Date(s.gameStartedAt).getTime() - offset : null;
  const tick=()=>{ const elapsed=startedAt?Math.max(0,(Date.now()-startedAt)/1000):0; $('gameTimerText').textContent=s.status==='lobby'?'Not started':fmt(elapsed); };
  tick(); if(s.status==='active') timerHandle=setInterval(tick,500);
}
function prof(p){ if(p>=90)return 'Advanced'; if(p>=80)return 'Proficient'; if(p>=70)return 'Approaching'; return 'Needs Review'; }
function renderPlayers(){
  if(data.players.length===0){ $('playersTab').innerHTML='<div class="card muted">No students have joined yet.</div>'; return; }
  let html='<table class="table"><thead><tr><th>Student</th><th>Progress</th><th>Current Q Time</th><th>Total Test Time</th><th>Avg/Q</th><th>Score</th><th>Proficiency</th></tr></thead><tbody>';
  data.players.forEach(p=>{ const sc=p.score; const answered=sc.rows.filter(r=>r.selected).length; const done=p.completed?'Done':`${answered}/${sc.total}`; html+=`<tr><td><b>${esc(p.name)}</b><br><span class="muted small">${p.id}</span></td><td>${done}</td><td>${p.completed?'—':fmt(p.currentQuestionSeconds)}</td><td>${fmt(sc.testSeconds)}</td><td>${fmt(sc.avgAnswerSeconds)}</td><td><b>${sc.correct}/${sc.total}</b> (${sc.percent}%)</td><td>${prof(sc.percent)}</td></tr>`; });
  html+='</tbody></table>'; $('playersTab').innerHTML=html;
}
function renderAnswers(){
  if(data.players.length===0){ $('answersTab').innerHTML='<div class="card muted">Answer review appears after students join.</div>'; return; }
  $('answersTab').innerHTML=data.players.map(p=>{ const sc=p.score; return `<div class="card"><h2>${esc(p.name)} — ${sc.correct}/${sc.total} (${sc.percent}%)</h2><p class="muted">Total test time: <b>${fmt(sc.testSeconds)}</b> | Average per answered question: <b>${fmt(sc.avgAnswerSeconds)}</b></p>${sc.rows.map(r=>`<div class="host-question"><div class="row"><span class="pill">#${r.index}</span><span class="pill">${esc(r.topic)}</span><span class="pill">${esc(r.skill)}</span><span class="pill">${esc(r.difficulty)}</span><span class="pill">Answer time: ${r.answerSeconds==null?'Not answered':fmt(r.answerSeconds)}</span></div><p><b>${esc(r.question)}</b></p><p>Student Answer: <span class="${r.selected?(r.isCorrect?'good':'bad'):'warn'}">${esc(r.selected||'Not answered')}</span></p><p>Correct Answer: <span class="good">${esc(r.correctAnswer)}</span></p><p class="muted small">${esc(r.explanation)}</p></div>`).join('')}</div>`; }).join('');
}
function renderSkills(){
  const skillMap={}; data.players.forEach(p=>p.score.rows.forEach(r=>{ const key=`${r.topic} — ${r.skill}`; if(!skillMap[key])skillMap[key]={correct:0,total:0,time:0,timed:0}; if(r.selected){ skillMap[key].total++; if(r.isCorrect)skillMap[key].correct++; if(r.answerSeconds!=null){skillMap[key].time+=Number(r.answerSeconds||0); skillMap[key].timed++;} } }));
  const rows=Object.entries(skillMap).sort((a,b)=>((a[1].correct/a[1].total||0)-(b[1].correct/b[1].total||0)));
  if(!rows.length){ $('skillsTab').innerHTML='<div class="card muted">Skill report appears as students answer questions.</div>'; return; }
  let html='<table class="table"><thead><tr><th>Skill</th><th>Correct</th><th>Accuracy</th><th>Avg Time</th></tr></thead><tbody>';
  rows.forEach(([skill,v])=>{ const pct=v.total?Math.round(v.correct/v.total*100):0; const avg=v.timed?Math.round(v.time/v.timed):0; html+=`<tr><td>${esc(skill)}</td><td>${v.correct}/${v.total}</td><td class="${pct>=80?'good':pct>=70?'warn':'bad'}">${pct}%</td><td>${fmt(avg)}</td></tr>`; });
  html+='</tbody></table>'; $('skillsTab').innerHTML=html;
}
async function setStatus(status){ await api('/api/host/status',{method:'POST',body:JSON.stringify({code:host.code,hostPin:host.pin,status})}); await refresh(); }
async function resetSession(){ if(!confirm('Delete this session and all student results?'))return; await api('/api/host/reset',{method:'POST',body:JSON.stringify({code:host.code,hostPin:host.pin})}); localStorage.removeItem('geoHostCode'); localStorage.removeItem('geoHostPin'); host={code:'',pin:''}; showSetup(); }
function esc(x){ return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
$('createBtn').onclick=createSession; $('refreshBtn').onclick=refresh; $('startBtn').onclick=()=>setStatus('active'); $('closeBtn').onclick=()=>setStatus('closed'); $('resetBtn').onclick=resetSession; $('selectAll').onclick=()=>document.querySelectorAll('#topicList input').forEach(x=>x.checked=true); $('clearAll').onclick=()=>document.querySelectorAll('#topicList input').forEach(x=>x.checked=false); document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{ document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); ['players','answers','skills'].forEach(t=>$(t+'Tab').classList.toggle('hidden',t!==btn.dataset.tab)); });
loadTopics().then(refresh); setInterval(()=>{ if(!document.hidden && host.code) refresh(); },5000);
