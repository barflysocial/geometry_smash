const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'sessions.json');
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions.json'), 'utf8'));

let sessions = loadSessions();

function loadSessions() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveSessions() { fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2)); }
function id(len = 8) { return crypto.randomBytes(16).toString('hex').slice(0, len).toUpperCase(); }
function hashSeed(input) {
  const h = crypto.createHash('sha256').update(input).digest();
  return h.readUInt32BE(0);
}
function rng(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seedText) {
  const copy = [...arr];
  const rand = rng(hashSeed(seedText));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function pickQuestionIds(session, playerId) {
  const selectedTopics = session.topicSlugs.length ? session.topicSlugs : (QUESTIONS.courses?.find(c => c.slug === session.course)?.topicSlugs || QUESTIONS.topics.map(t => t.slug));
  const all = [];
  for (const slug of selectedTopics) {
    const qs = QUESTIONS.bank[slug] || [];
    all.push(...qs.map(q => q.id));
  }
  const shuffled = shuffle(all, `${session.code}:${playerId}:question-set`);
  return shuffled.slice(0, Math.min(session.questionCount, shuffled.length));
}
function findQuestion(qid) {
  for (const slug of Object.keys(QUESTIONS.bank)) {
    const found = QUESTIONS.bank[slug].find(q => q.id === qid);
    if (found) return found;
  }
  return null;
}
function nowIso() { return new Date().toISOString(); }
function elapsedSeconds(startIso, endIso = null) {
  if (!startIso) return 0;
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1000));
}
function ensurePlayerStarted(session, player) {
  if (session.status === 'active' && !player.startedAt) player.startedAt = nowIso();
  if (session.status === 'active' && !player.completed && !player.questionStartedAt) player.questionStartedAt = nowIso();
}
function publicQuestion(session, player, index) {
  const qid = player.questionIds[index];
  const q = findQuestion(qid);
  if (!q) return null;
  return { id: q.id, topic: q.topic, difficulty: q.difficulty, skill: q.skill, question: q.question, choices: buildPublicChoices(q, session, player, index), index, total: player.questionIds.length, questionStartedAt: player.questionStartedAt, playerStartedAt: player.startedAt, trackingMode: true, answerMode: 'multiple-choice' };
}
function normalizeAnswer(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/°/g, ' degrees')
    .replace(/\s+/g, ' ');
}

function parseNumberWithUnit(value) {
  const text = String(value ?? '').trim();
  const m = text.match(/^(-?\d+(?:\.\d+)?)(°|%|\s*units?|\s*cm|\s*m|\s*ft)?$/i);
  if (!m) return null;
  return { value: Number(m[1]), unit: (m[2] || '').trim() };
}
function fmtChoiceNumber(n, unit) {
  const rounded = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(Number(n.toFixed(2)));
  return `${rounded}${unit === '°' || unit === '%' ? unit : unit ? ' ' + unit : ''}`;
}
function refineChoices(q) {
  const correct = String(q.correctAnswer ?? '').trim();
  let choices = Array.isArray(q.choices) ? q.choices.map(x => String(x).trim()).filter(Boolean) : [];
  choices = choices.filter(x => !/\+\s*1\b/.test(x));
  if (!choices.some(x => normalizeAnswer(x) === normalizeAnswer(correct))) choices.unshift(correct);
  const parsed = parseNumberWithUnit(correct);
  if (parsed) {
    const base = parsed.value;
    const unit = parsed.unit;
    const offsets = [5, -5, 10, -10, 15, -15, 2, -2, 20, -20, 30, -30];
    for (const off of offsets) {
      if (choices.length >= 4) break;
      const candidate = fmtChoiceNumber(base + off, unit);
      if (base + off > 0 && !choices.some(x => normalizeAnswer(x) === normalizeAnswer(candidate))) choices.push(candidate);
    }
    if (choices.length < 4 && base !== 0) {
      for (const factor of [0.5, 1.5, 2, 0.75]) {
        if (choices.length >= 4) break;
        const candidate = fmtChoiceNumber(base * factor, unit);
        if (base * factor > 0 && !choices.some(x => normalizeAnswer(x) === normalizeAnswer(candidate))) choices.push(candidate);
      }
    }
  }
  const fallback = ['Not enough information', 'A related but different value', 'The inverse relationship', 'The same measure only'];
  for (const f of fallback) {
    if (choices.length >= 4) break;
    if (!choices.some(x => normalizeAnswer(x) === normalizeAnswer(f))) choices.push(f);
  }
  const unique = [];
  for (const c of choices) {
    if (!unique.some(x => normalizeAnswer(x) === normalizeAnswer(c))) unique.push(c);
  }
  // Limit to four choices and keep the correct answer present. Distractors are intentionally close/plausible where possible.
  const correctItem = unique.find(x => normalizeAnswer(x) === normalizeAnswer(correct)) || correct;
  const distractors = unique.filter(x => normalizeAnswer(x) !== normalizeAnswer(correct)).slice(0, 3);
  return [correctItem, ...distractors].slice(0, 4);
}
function buildPublicChoices(q, session, player, index) {
  const choices = refineChoices(q);
  let shuffled = shuffle(choices, `${session.code}:${player.id}:${q.id}:choice-order`);
  // Avoid the old answer-key pattern where the correct answer was always listed first.
  // The correct answer can move, but never stays in the source position by default.
  if (normalizeAnswer(shuffled[0]) === normalizeAnswer(q.correctAnswer) && shuffled.length > 1) {
    const swapIndex = 1 + (hashSeed(`${session.code}:${player.id}:${q.id}:correct-swap`) % (shuffled.length - 1));
    [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  }
  return shuffled.map((text, i) => ({ id: `${q.id}-choice-${i}`, label: text }));
}
function scorePlayer(player) {
  let correct = 0;
  const rows = player.questionIds.map((qid, index) => {
    const q = findQuestion(qid);
    const selected = player.answers[qid] || null;
    const isCorrect = normalizeAnswer(selected) === normalizeAnswer(q.correctAnswer);
    if (isCorrect) correct++;
    return { index: index + 1, id: qid, topic: q.topic, skill: q.skill, difficulty: q.difficulty, question: q.question, selected, correctAnswer: q.correctAnswer, isCorrect, explanation: q.explanation, answerSeconds: player.answerTimes?.[qid] ?? null };
  });
  const percent = rows.length ? Math.round((correct / rows.length) * 100) : 0;
  const testSeconds = player.startedAt ? elapsedSeconds(player.startedAt, player.completedAt) : 0;
  const answeredRows = rows.filter(r => r.answerSeconds !== null && r.answerSeconds !== undefined);
  const avgAnswerSeconds = answeredRows.length ? Math.round(answeredRows.reduce((sum, r) => sum + Number(r.answerSeconds || 0), 0) / answeredRows.length) : 0;
  return { correct, total: rows.length, percent, rows, testSeconds, avgAnswerSeconds };
}

function studentSafeScore(player) {
  const full = scorePlayer(player);
  const missedRows = full.rows
    .filter(r => !r.isCorrect)
    .map(r => ({
      index: r.index,
      id: r.id,
      topic: r.topic,
      skill: r.skill,
      difficulty: r.difficulty,
      question: r.question,
      selected: r.selected || 'Not answered',
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
      answerSeconds: r.answerSeconds
    }));
  return {
    correct: full.correct,
    total: full.total,
    percent: full.percent,
    testSeconds: full.testSeconds,
    avgAnswerSeconds: full.avgAnswerSeconds,
    reviewMode: 'missed-only',
    missedRows
  };
}

function safeSession(session) {
  return {
    code: session.code,
    title: session.title,
    course: session.course || 'geometry',
    courseName: session.courseName || 'Geometry Honors',
    status: session.status,
    questionCount: session.questionCount,
    topicSlugs: session.topicSlugs,
    createdAt: session.createdAt,
    playerCount: Object.keys(session.players).length,
    trackingMode: true,
    gameStartedAt: session.gameStartedAt || null,
    serverNow: nowIso(),
    gameElapsedSeconds: session.gameStartedAt ? elapsedSeconds(session.gameStartedAt) : 0
  };
}
function send(res, status, data, type = 'application/json') {
  const body = type === 'application/json' ? JSON.stringify(data) : data;
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
async function body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}
function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/student') pathname = '/student.html';
  if (pathname === '/host') pathname = '/host.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };
    send(res, 200, content, types[ext] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);

  if (req.method === 'GET' && url.pathname === '/api/topics') return send(res, 200, { courses: QUESTIONS.courses || [{ slug: 'all', name: 'All Topics', topicSlugs: QUESTIONS.topics.map(t => t.slug) }], topics: QUESTIONS.topics });

  if (req.method === 'POST' && url.pathname === '/api/host/session') {
    const b = await body(req);
    const code = id(6);
    const hostPin = String(b.hostPin || id(5));
    const course = String(b.course || 'geometry');
    const courseInfo = (QUESTIONS.courses || []).find(c => c.slug === course) || (QUESTIONS.courses || [])[0] || { slug: course, name: 'Quiz', topicSlugs: QUESTIONS.topics.map(t => t.slug) };
    const allowedTopicSet = new Set(courseInfo.topicSlugs || []);
    const topicSlugs = Array.isArray(b.topicSlugs) ? b.topicSlugs.filter(s => QUESTIONS.bank[s] && allowedTopicSet.has(s)) : [];
    const availableCount = (topicSlugs.length ? topicSlugs : [...allowedTopicSet]).reduce((sum, slug) => sum + ((QUESTIONS.bank[slug] || []).length), 0);
    const questionCount = Math.max(1, Math.min(Number(b.questionCount || 25), availableCount || 25));
    sessions[code] = { code, hostPin, title: b.title || `${courseInfo.name} Challenge`, course: courseInfo.slug, courseName: courseInfo.name, topicSlugs, questionCount, gameStartedAt: null, status: 'lobby', players: {}, createdAt: nowIso() };
    saveSessions();
    return send(res, 200, { session: safeSession(sessions[code]), hostPin });
  }

  if (req.method === 'GET' && url.pathname === '/api/host/session') {
    const code = (url.searchParams.get('code') || '').toUpperCase();
    const pin = url.searchParams.get('pin') || '';
    const session = sessions[code];
    if (!session || session.hostPin !== pin) return send(res, 404, { error: 'Session not found or host PIN incorrect.' });
    const players = Object.values(session.players).map(p => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, startedAt: p.startedAt || null, completedAt: p.completedAt || null, currentIndex: p.currentIndex, completed: p.completed, questionStartedAt: p.questionStartedAt || null, currentQuestionSeconds: p.completed ? 0 : elapsedSeconds(p.questionStartedAt), testSeconds: p.startedAt ? elapsedSeconds(p.startedAt, p.completedAt) : 0, score: scorePlayer(p) }));
    return send(res, 200, { session: safeSession(session), hostPin: session.hostPin, topics: QUESTIONS.topics, players });
  }

  if (req.method === 'POST' && url.pathname === '/api/host/status') {
    const b = await body(req);
    const code = String(b.code || '').toUpperCase();
    const session = sessions[code];
    if (!session || session.hostPin !== String(b.hostPin || '')) return send(res, 404, { error: 'Session not found or host PIN incorrect.' });
    const nextStatus = ['lobby', 'active', 'closed'].includes(b.status) ? b.status : session.status;
    session.status = nextStatus;
    if (nextStatus === 'active') {
      if (!session.gameStartedAt) session.gameStartedAt = nowIso();
      for (const p of Object.values(session.players)) ensurePlayerStarted(session, p);
    }
    saveSessions();
    return send(res, 200, { session: safeSession(session) });
  }

  if (req.method === 'POST' && url.pathname === '/api/host/reset') {
    const b = await body(req);
    const code = String(b.code || '').toUpperCase();
    const session = sessions[code];
    if (!session || session.hostPin !== String(b.hostPin || '')) return send(res, 404, { error: 'Session not found or host PIN incorrect.' });
    delete sessions[code];
    saveSessions();
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/join') {
    const b = await body(req);
    const code = String(b.code || '').toUpperCase().trim();
    const name = String(b.name || '').trim().slice(0, 60);
    const existingId = String(b.playerId || '').trim();
    const session = sessions[code];
    if (!session) return send(res, 404, { error: 'Session code not found.' });
    if (!name) return send(res, 400, { error: 'Student name is required.' });
    let player = existingId && session.players[existingId] ? session.players[existingId] : null;
    if (!player) {
      const playerId = id(10);
      player = { id: playerId, name, joinedAt: nowIso(), startedAt: null, completedAt: null, questionIds: [], answers: {}, answerTimes: {}, currentIndex: 0, completed: false, questionStartedAt: null };
      player.questionIds = pickQuestionIds(session, playerId);
      session.players[playerId] = player;
    } else {
      player.name = name;
    }
    if (session.status === 'active') ensurePlayerStarted(session, player);
    saveSessions();
    return send(res, 200, { session: safeSession(session), player: { id: player.id, name: player.name, currentIndex: player.currentIndex, completed: player.completed } });
  }

  if (req.method === 'GET' && url.pathname === '/api/student/state') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const playerId = String(url.searchParams.get('playerId') || '');
    const session = sessions[code];
    const player = session?.players[playerId];
    if (!session || !player) return send(res, 404, { error: 'Student session not found.' });
    const question = player.completed || session.status === 'closed' ? null : publicQuestion(session, player, player.currentIndex);
    return send(res, 200, { session: safeSession(session), player: { id: player.id, name: player.name, currentIndex: player.currentIndex, completed: player.completed, answered: Object.keys(player.answers).length, currentQuestionSeconds: player.completed ? 0 : elapsedSeconds(player.questionStartedAt), testSeconds: player.startedAt ? elapsedSeconds(player.startedAt, player.completedAt) : 0 }, question, score: (player.completed || session.status === 'closed') ? studentSafeScore(player) : null });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/answer') {
    const b = await body(req);
    const code = String(b.code || '').toUpperCase();
    const playerId = String(b.playerId || '');
    const qid = String(b.questionId || '');
    const answer = String(b.answer || '').trim().slice(0, 300);
    const session = sessions[code];
    const player = session?.players[playerId];
    if (!session || !player) return send(res, 404, { error: 'Student session not found.' });
    if (session.status !== 'active') return send(res, 400, { error: 'The quiz is not active yet.' });
    ensurePlayerStarted(session, player);
    if (player.completed) { saveSessions(); return send(res, 200, { completed: true, nextQuestion: null, score: studentSafeScore(player) }); }
    const expectedQid = player.questionIds[player.currentIndex];
    if (qid !== expectedQid) return send(res, 400, { error: 'Question mismatch. Refresh and try again.' });
    if (!answer) return send(res, 400, { error: 'Select an answer before submitting.' });
    player.answers[qid] = answer;
    player.answerTimes = player.answerTimes || {};
    player.answerTimes[qid] = elapsedSeconds(player.questionStartedAt);
    player.currentIndex += 1;
    if (player.currentIndex >= player.questionIds.length) {
      player.completed = true;
      player.completedAt = nowIso();
      player.questionStartedAt = null;
    } else {
      player.questionStartedAt = nowIso();
    }
    saveSessions();
    return send(res, 200, { completed: player.completed, nextQuestion: player.completed ? null : publicQuestion(session, player, player.currentIndex), score: player.completed ? studentSafeScore(player) : null, session: safeSession(session) });
  }

  return send(res, 404, { error: 'API route not found.' });
});

server.listen(PORT, () => console.log(`Math Honors Challenge running on port ${PORT}`));
