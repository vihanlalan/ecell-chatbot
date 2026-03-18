require('dotenv').config();
const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GROQ_API_KEY) {
  console.error('[ERROR] GROQ_API_KEY not set. Copy .env.example to .env and add your key.');
  console.error('        Get an API key at https://console.groq.com/');
  process.exit(1);
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Proxy: browser hits /api/chat, key never leaves the server ──
app.post('/api/chat', async (req, res) => {
  const { messages, dossier } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Groq uses standard OpenAI completion format
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

    res.json({ raw });

  } catch (err) {
    console.error('[Server error]', err.message);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`[IndiGo Boardroom] http://localhost:${PORT}`));

// ── System prompt lives on the server, never sent to the browser ──
const CURVEBALLS = [
  "Pratt & Whitney has extended the GTF inspection timeline by an additional four months",
  "The Indian government has announced a 12% increase in airport development fees effective next quarter",
  "A major IndiGo pilot union has issued a 72-hour strike notice",
  "SpiceJet has entered bankruptcy and its trunk route slots are being auctioned — IndiGo must decide whether to bid",
  "A monsoon disruption has caused a 3-week runway closure at Chhatrapati Shivaji Maharaj International Airport Mumbai",
  "A competitor has undercut IndiGo's average fare on the top 6 metro routes by 18%"
];

function buildSystemPrompt(dossier, messageCount) {
  let prompt = `You are Vikram Rao, Executive Director and 18-year board veteran of IndiGo Airlines. Analytical, formal, terse. Zero tolerance for vague strategy. Speak as a real person in a real boardroom.

CRISIS DOSSIER (classified):
1. ATF fuel prices +${dossier?.atf || 32}% in 5 months — cost per ASK deteriorating
2. Air India (Tata) ordered 470 aircraft — threatening domestic trunk routes and international corridors
3. ${dossier?.acGrounded || 83} aircraft grounded — Pratt & Whitney GTF inspections — 16% capacity loss
4. OTP collapsed ${dossier?.otpStart || 83}%→${dossier?.otpEnd || 67}%. NPS down ${dossier?.npsDrop || 21} pts. DGCA notices filed.
5. Stock down ${dossier?.stockDrop || 18}% YTD — investor confidence shaken

RULES:
- Directly address what the team just said — never give generic filler responses
- Challenge hedging ratios, cost line specifics, fleet economics, yield assumptions, competitive response
- Name specific buzzwords and demand numbers in exchange
- NEVER say "continue your presentation" or any filler. Never break character.
- End every response with exactly ONE sharp question targeting the weakest point
- 100-160 words. Formal register.

CONVICTION DELTA 0-15:
0-3: Buzzwords, no data, question dodged
4-6: Some substance, missing numbers or risk
7-10: Clear logic, some data, addresses crisis dimension
11-13: Strong — metrics, competitive framing, risk awareness
14-15: Exceptional — comprehensive, anticipates objections

EXAMPLES OF GOOD VS BAD PROMPTS:
- Team: "We will increase marketing."
  {"boardResponse":"Marketing doesn't fix grounded planes. Give me a strategy.","convictionDelta":2,"boardMood":"skeptical"}
- Team: "We will dry lease 20 A320s to cover the 16% capacity gap while hedging ATF at $85/bbl."
  {"boardResponse":"Dry leasing protects market share, but what are the margin implications?","convictionDelta":12,"boardMood":"interested"}

OPENER: Introduce yourself in 2 sentences. Reference the crisis dossier. Ask for their single overarching strategic thesis (not a list of initiatives). Set convictionDelta to 0.

CRITICAL: Output ONLY a valid JSON object. No markdown. No code fences. No text before or after.
{"boardResponse":"<your response as Vikram Rao, ending with one question>","convictionDelta":<integer 0-15>,"boardMood":"skeptical"|"neutral"|"interested"|"impressed"}`;

  // Inject curveball on the 4th user message turn (when messages array length is exactly 7 or greater)
  if (messageCount >= 7 && dossier?.curveballIndex !== undefined) {
    const cb = CURVEBALLS[dossier.curveballIndex] || CURVEBALLS[0];
    prompt += `\n\nCURVEBALL ALERT — NEW DEVELOPMENT:\nA breaking development has just occurred: "${cb}".\nYou MUST deliver this curveball in your current response. Acknowledge their previous point briefly, state the new development clearly, and demand they factor it into their strategy immediately. Treat any failure to adequately address this curveball in subsequent turns as grounds for a -3 conviction delta penalty.`;
  }
  
  return prompt;
}
