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
  const selectedTopics = session.topicSlugs.length ? session.topicSlugs : QUESTIONS.topics.map(t => t.slug);
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
function publicQuestion(session, player, index) {
  const qid = player.questionIds[index];
  const q = findQuestion(qid);
  if (!q) return null;
  return { id: q.id, topic: q.topic, difficulty: q.difficulty, skill: q.skill, question: q.question, index, total: player.questionIds.length };
}
function normalizeAnswer(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/°/g, ' degrees')
    .replace(/\s+/g, ' ');
}
function scorePlayer(player) {
  let correct = 0;
  const rows = player.questionIds.map((qid, index) => {
    const q = findQuestion(qid);
    const selected = player.answers[qid] || null;
    const isCorrect = normalizeAnswer(selected) === normalizeAnswer(q.correctAnswer);
    if (isCorrect) correct++;
    return { index: index + 1, id: qid, topic: q.topic, skill: q.skill, difficulty: q.difficulty, question: q.question, selected, correctAnswer: q.correctAnswer, isCorrect, explanation: q.explanation };
  });
  const percent = rows.length ? Math.round((correct / rows.length) * 100) : 0;
  return { correct, total: rows.length, percent, rows };
}
function safeSession(session) {
  return {
    code: session.code,
    title: session.title,
    status: session.status,
    questionCount: session.questionCount,
    topicSlugs: session.topicSlugs,
    createdAt: session.createdAt,
    playerCount: Object.keys(session.players).length
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

  if (req.method === 'GET' && url.pathname === '/api/topics') return send(res, 200, QUESTIONS.topics);

  if (req.method === 'POST' && url.pathname === '/api/host/session') {
    const b = await body(req);
    const code = id(6);
    const hostPin = String(b.hostPin || id(5));
    const topicSlugs = Array.isArray(b.topicSlugs) ? b.topicSlugs.filter(s => QUESTIONS.bank[s]) : [];
    const questionCount = Math.max(1, Math.min(Number(b.questionCount || 25), topicSlugs.length === 1 ? 50 : 1250));
    sessions[code] = { code, hostPin, title: b.title || 'Geometry Honors Challenge', topicSlugs, questionCount, status: 'lobby', players: {}, createdAt: new Date().toISOString() };
    saveSessions();
    return send(res, 200, { session: safeSession(sessions[code]), hostPin });
  }

  if (req.method === 'GET' && url.pathname === '/api/host/session') {
    const code = (url.searchParams.get('code') || '').toUpperCase();
    const pin = url.searchParams.get('pin') || '';
    const session = sessions[code];
    if (!session || session.hostPin !== pin) return send(res, 404, { error: 'Session not found or host PIN incorrect.' });
    const players = Object.values(session.players).map(p => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, currentIndex: p.currentIndex, completed: p.completed, score: scorePlayer(p) }));
    return send(res, 200, { session: safeSession(session), hostPin: session.hostPin, topics: QUESTIONS.topics, players });
  }

  if (req.method === 'POST' && url.pathname === '/api/host/status') {
    const b = await body(req);
    const code = String(b.code || '').toUpperCase();
    const session = sessions[code];
    if (!session || session.hostPin !== String(b.hostPin || '')) return send(res, 404, { error: 'Session not found or host PIN incorrect.' });
    session.status = ['lobby', 'active', 'closed'].includes(b.status) ? b.status : session.status;
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
      player = { id: playerId, name, joinedAt: new Date().toISOString(), questionIds: [], answers: {}, currentIndex: 0, completed: false };
      player.questionIds = pickQuestionIds(session, playerId);
      session.players[playerId] = player;
    } else {
      player.name = name;
    }
    saveSessions();
    return send(res, 200, { session: safeSession(session), player: { id: player.id, name: player.name, currentIndex: player.currentIndex, completed: player.completed } });
  }

  if (req.method === 'GET' && url.pathname === '/api/student/state') {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const playerId = String(url.searchParams.get('playerId') || '');
    const session = sessions[code];
    const player = session?.players[playerId];
    if (!session || !player) return send(res, 404, { error: 'Student session not found.' });
    const question = player.completed ? null : publicQuestion(session, player, player.currentIndex);
    return send(res, 200, { session: safeSession(session), player: { id: player.id, name: player.name, currentIndex: player.currentIndex, completed: player.completed, answered: Object.keys(player.answers).length }, question, score: player.completed ? scorePlayer(player) : null });
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
    const expectedQid = player.questionIds[player.currentIndex];
    if (qid !== expectedQid) return send(res, 400, { error: 'Question mismatch. Refresh and try again.' });
    if (!answer) return send(res, 400, { error: 'Type an answer before submitting.' });
    player.answers[qid] = answer;
    player.currentIndex += 1;
    if (player.currentIndex >= player.questionIds.length) player.completed = true;
    saveSessions();
    return send(res, 200, { completed: player.completed, nextQuestion: player.completed ? null : publicQuestion(session, player, player.currentIndex), score: player.completed ? scorePlayer(player) : null });
  }

  return send(res, 404, { error: 'API route not found.' });
});

server.listen(PORT, () => console.log(`Geometry Honors Challenge running on port ${PORT}`));
