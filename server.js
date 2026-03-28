require('dotenv').config();
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');

// ── In-memory session store ──
const MAX_PROMPTS = 7;
const MAX_SCORE   = MAX_PROMPTS * 15;
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const sessions    = new Map();

function generateDossier() {
  return {
    peakShare: Math.floor(Math.random() * 9) + 48,
    currentShare: Math.floor(Math.random() * 4) + 4,
    salesDrop: Math.floor(Math.random() * 11) + 80,
    valuationSlash: Math.floor(Math.random() * 11) + 78,
    sharePriceDrop: Math.floor(Math.random() * 11) + 65,
    execExits: Math.floor(Math.random() * 7) + 8,
    unresolvedComplaints: Math.floor(Math.random() * 20001) + 70000,
    curveballIndex: Math.floor(Math.random() * 6)
  };
}

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
}, 5 * 60 * 1000);

const app  = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GROQ_API_KEY) {
  console.error('[ERROR] GROQ_API_KEY not set. Copy .env.example to .env and add your key.');
  console.error('        Get an API key at https://console.groq.com/');
  process.exit(1);
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Create a new session ──
app.post('/api/session/create', (_req, res) => {
  const sessionId = crypto.randomUUID();
  const dossier = generateDossier();
  sessions.set(sessionId, {
    dossier,
    score: 0,
    promptsUsed: 0,
    ethicsStrikes: 0,
    createdAt: Date.now(),
    ended: false
  });
  console.log(`[Session] Created ${sessionId}`);
  res.json({ sessionId, dossier });
});

// ── Get session state (read-only) ──
app.get('/api/session/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const pct = Math.min(100, Math.round((session.score / MAX_SCORE) * 100));
  res.json({
    score: session.score,
    pct,
    promptsUsed: session.promptsUsed,
    maxPrompts: MAX_PROMPTS,
    ended: session.ended,
    dossier: session.dossier
  });
});

// ── Chat endpoint with server-side scoring ──
app.post('/api/chat', async (req, res) => {
  const { messages, sessionId } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const session = sessionId ? sessions.get(sessionId) : null;
  const dossier = session?.dossier || req.body.dossier || {};

  // ── Unethical content filter ──
  const lastUserMsg = messages[messages.length - 1];
  if (lastUserMsg && lastUserMsg.role === 'user' && session) {
    const violation = checkEthics(lastUserMsg.content);
    if (violation) {
      session.ethicsStrikes = (session.ethicsStrikes || 0) + 1;
      const ETHICS_PENALTY = 5;
      session.score = Math.max(0, session.score - ETHICS_PENALTY);
      session.promptsUsed += 1;
      const serverScore = session.score;
      const promptsUsed = session.promptsUsed;

      if (session.ethicsStrikes >= 2) {
        // Second offense → immediate rejection
        session.ended = true;
        console.log(`[Session ${sessionId}] ETHICS REJECTED — strike ${session.ethicsStrikes}: "${violation}"`);
        const raw = JSON.stringify({
          boardResponse: `This board will not entertain strategies involving ${violation}. This is your second ethics violation. Your proposal is immediately rejected. This board session is terminated.`,
          convictionDelta: 0,
          boardMood: "skeptical"
        });
        const pct = Math.min(100, Math.round((serverScore / MAX_SCORE) * 100));
        return res.json({ raw, serverScore, serverPct: pct, promptsUsed, ethicsViolation: true, sessionTerminated: true });
      } else {
        // First offense → stern warning + penalty
        console.log(`[Session ${sessionId}] ETHICS WARNING — strike ${session.ethicsStrikes}: "${violation}"`);
        const raw = JSON.stringify({
          boardResponse: `I will stop you right there. Strategies involving ${violation} are not just unethical — they are criminal. This board does not entertain illegality. You have been penalised ${ETHICS_PENALTY} conviction points. If you propose anything remotely unethical again, your session will be terminated immediately and your proposal will be rejected. Now, give me a legitimate recovery strategy.`,
          convictionDelta: 0,
          boardMood: "skeptical"
        });
        const pct = Math.min(100, Math.round((serverScore / MAX_SCORE) * 100));
        return res.json({ raw, serverScore, serverPct: pct, promptsUsed, ethicsViolation: true });
      }
    }
  }

  const groqMessages = [
    { role: 'system', content: buildSystemPrompt(dossier, messages.length) },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 4000)
    }))
  ];

  const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_tokens: 1024
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Groq error]', response.status, JSON.stringify(data));
      const errMsg = data?.error?.message || 'Upstream API error';
      return res.status(response.status).json({ error: errMsg });
    }

    const raw = data?.choices?.[0]?.message?.content ?? '';
    if (!raw) {
      console.error('[Groq] Empty response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Empty response from Groq' });
    }

    // ── Server-side score tracking ──
    let serverScore = session?.score || 0;
    let promptsUsed = session?.promptsUsed || 0;
    if (session && !session.ended) {
      const delta = parseConvictionDelta(raw);
      session.score = Math.min(MAX_SCORE, session.score + delta);
      session.promptsUsed += 1;
      serverScore = session.score;
      promptsUsed = session.promptsUsed;
      if (session.promptsUsed >= MAX_PROMPTS) session.ended = true;
      console.log(`[Session ${sessionId}] prompt=${promptsUsed} delta=+${delta} total=${serverScore}`);
    }

    const pct = Math.min(100, Math.round((serverScore / MAX_SCORE) * 100));
    res.json({ raw, serverScore, serverPct: pct, promptsUsed });

  } catch (err) {
    console.error('[Server error]', err.message);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// ── Parse convictionDelta from Groq response ──
function parseConvictionDelta(raw) {
  try {
    const clean = raw.trim().replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      if (typeof parsed.convictionDelta === 'number') return Math.max(0, Math.min(15, parsed.convictionDelta));
    }
  } catch (_) {}
  // Fallback: regex
  const m = raw.match(/"convictionDelta"\s*:\s*(\d+)/);
  return m ? Math.max(0, Math.min(15, parseInt(m[1], 10))) : 0;
}

// ── Unethical content detection ──
const BANNED_PATTERNS = [
  { pattern: /\b(embezzl\w*)\b/i, label: 'embezzlement' },
  { pattern: /\b(brib\w*)\b/i, label: 'bribery' },
  { pattern: /\b(cheat\w*|cheating)\b/i, label: 'cheating' },
  { pattern: /\b(fraud\w*|fraudul\w*)\b/i, label: 'fraud' },
  { pattern: /\b(money\s*launder\w*)\b/i, label: 'money laundering' },
  { pattern: /\b(corruption|corrupt\w*)\b/i, label: 'corruption' },
  { pattern: /\b(insider\s*trad\w*)\b/i, label: 'insider trading' },
  { pattern: /\b(tax\s*evasion|evad\w*\s*tax\w*)\b/i, label: 'tax evasion' },
  { pattern: /\b(kickback\w*)\b/i, label: 'kickbacks' },
  { pattern: /\b(ponzi|pyramid\s*scheme)\b/i, label: 'fraudulent schemes' },
  { pattern: /\b(forge\w*|forgery)\b/i, label: 'forgery' },
  { pattern: /\b(extor\w*)\b/i, label: 'extortion' },
  { pattern: /\b(steal\w*|theft|stolen)\b/i, label: 'theft' },
  { pattern: /\b(illegal\w*|illicit)\b/i, label: 'illegal activities' },
  { pattern: /\b(scam\w*)\b/i, label: 'scams' },
  { pattern: /\b(manipulat\w*\s*(stock|share|market|price))\b/i, label: 'market manipulation' },
  { pattern: /\b(black\s*money)\b/i, label: 'black money' },
];

function checkEthics(text) {
  if (!text || typeof text !== 'string') return null;
  for (const { pattern, label } of BANNED_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`[Ola Boardroom] http://localhost:${PORT}`));

// ── System prompt lives on the server, never sent to the browser ──
const CURVEBALLS = [
  "Ather Energy has launched a ₹79,999 scooter undercutting Ola's S1 Air by 20% — early booking numbers are massive",
  "A viral video showing an Ola Electric scooter battery explosion has hit 15 million views and is trending nationwide",
  "Rapido has announced $200M in fresh funding to expand into 100 new cities, directly targeting Ola Consumer's remaining strongholds",
  "CCPA has issued a formal order mandating Ola resolve all pending 80,000+ complaints within 60 days or face a ₹500Cr penalty",
  "Three senior VPs at Krutrim have resigned simultaneously, citing toxic work culture and unrealistic AI roadmap deadlines",
  "Uber India has slashed driver commission rates by 8% to poach Ola drivers en masse — driver attrition is accelerating"
];

function buildSystemPrompt(dossier, messageCount) {
  let prompt = `You are Arjun Mehta, a veteran board advisor and 20-year Indian tech industry strategist. Analytical, formal, terse. Zero tolerance for vague strategy. Speak as a real person in a real boardroom evaluating a recovery plan for the Ola Group.

CRISIS DOSSIER (classified):
1. Ola Electric market share collapsed from ~${dossier?.peakShare || 52}% to under ${dossier?.currentShare || 6}% — sales down ~${dossier?.salesDrop || 85}% from peak
2. Ola Consumer valuation slashed by ${dossier?.valuationSlash || 83}% to $1.25B — Rapido and Uber have broken the ride-hailing duopoly
3. Post-IPO share price down ~${dossier?.sharePriceDrop || 70}% from high — investor confidence shattered
4. Krutrim leadership crisis — ${dossier?.execExits || 12} senior executives including CTO and Head of Engineering resigned within months
5. ${dossier?.unresolvedComplaints || 80000}+ unresolved monthly complaints — CCPA regulatory crackdown underway

CORE ISSUE: The group's central failure is the institutionalisation of unreliable innovation — poor after-sales service, product reliability issues, leadership instability, and financial sustainability concerns across Ola Electric, Ola Consumer, and Krutrim.

RULES:
- Directly address what the team just said — never give generic filler responses
- Challenge product reliability claims, service infrastructure plans, competitive positioning against Rapido/Uber/Ather, customer retention metrics, and financial runway assumptions
- Name specific buzzwords and demand numbers in exchange
- NEVER say "continue your presentation" or any filler. Never break character.
- End every response with exactly ONE sharp question targeting the weakest point
- 100-160 words. Formal register.

CONVICTION DELTA 0-15:
0-3: Completely off-topic, question dodged, no effort
4-7: Buzzwords only, no data or specifics
8-10: Some substance with partial data — shows understanding
11-13: Clear logic, solid data, addresses crisis dimension — strong
14-15: Exceptional — comprehensive, anticipates objections, investor-grade

IMPORTANT SCORING GUIDANCE:
- Be fair and encouraging. If the team shows genuine strategic thinking with some specifics, score 8-10.
- Reserve 0-3 ONLY for completely irrelevant, nonsensical, or empty responses.
- A decent argument with some numbers should score at least 7-8.
- A strong argument with metrics and competitive awareness should score 11-13.

EXAMPLES OF GOOD VS BAD PROMPTS:
- Team: "We will improve customer experience."
  {"boardResponse":"Customer experience is a bumper sticker, not a strategy. 80,000 complaints are piling up monthly. Give me a concrete resolution pipeline with timelines.","convictionDelta":2,"boardMood":"skeptical"}
- Team: "We will deploy 500 mobile service vans in the top 30 cities within 90 days, targeting a 72-hour complaint resolution SLA, funded by pausing Krutrim's non-core R&D spend."
  {"boardResponse":"Mobile service vans address the immediate crisis, and redirecting Krutrim burn is pragmatic. But what happens to EV market share while you're firefighting service?","convictionDelta":12,"boardMood":"interested"}

OPENER: Introduce yourself in 2 sentences. Reference the crisis dossier. Ask for their single overarching strategic thesis (not a list of initiatives). Set convictionDelta to 0.

CRITICAL: Output ONLY a valid JSON object. No markdown. No code fences. No text before or after.
{"boardResponse":"<your response as Arjun Mehta, ending with one question>","convictionDelta":<integer 0-15>,"boardMood":"skeptical"|"neutral"|"interested"|"impressed"}`;

  // Inject curveball on the 4th user message turn (when messages array length is exactly 7 or greater)
  if (messageCount >= 7 && dossier?.curveballIndex !== undefined) {
    const cb = CURVEBALLS[dossier.curveballIndex] || CURVEBALLS[0];
    prompt += `\n\nCURVEBALL ALERT — NEW DEVELOPMENT:\nA breaking development has just occurred: "${cb}".\nYou MUST deliver this curveball in your current response. Acknowledge their previous point briefly, state the new development clearly, and demand they factor it into their strategy immediately. Treat any failure to adequately address this curveball in subsequent turns as grounds for a -3 conviction delta penalty.`;
  }
  
  return prompt;
}
