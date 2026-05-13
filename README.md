# Ola Group - Board Strategy Simulator

A competitive AI-powered boardroom simulation built for case competitions. Teams face a ruthless virtual board advisor and must pitch a recovery strategy for the Ola Group under time pressure, limited prompts, and a hidden scoring rubric.

---

## How It Works

| Element | Detail |
|---|---|
| **AI Persona** | Arjun Mehta - veteran board advisor, 20-year Indian tech strategist |
| **Model** | Llama 3.3 70B via [Groq](https://groq.com/) |
| **Prompts** | 7 team responses (+ 1 AI opener) |
| **Timer** | 25 minutes |
| **Verdict** | >= 62% conviction score = **Approved**, below = **Rejected** |

### Gameplay Flow

1. Team enters their name and reads the **Crisis Dossier** - randomized stats on Ola's market collapse, valuation drop, leadership exits, and complaint backlog.
2. The board advisor opens with a challenge. Teams type their recovery strategy arguments.
3. Each response is scored 0-15 on substance, specificity, and data quality. Vague buzzwords score near zero.
4. A **curveball** (e.g. competitor funding, viral battery explosion) is injected mid-session to stress-test adaptability.
5. On the 6th prompt, the advisor reveals which **hidden scoring pillars** the team failed to cover, giving one final chance.
6. Session ends when prompts or time run out. Final verdict is stamped.

### Hidden Scoring Pillars

The AI secretly evaluates whether teams cover three areas (revealed only on prompt 6):

- **Financials** - cost restructuring, investor confidence, valuation, funding runway
- **AI Strategy** - Krutrim leadership, AI integration, technical roadmap
- **Reliability & Trust** - product quality, after-sales service, complaints, regulatory compliance

---

## Tech Stack

```
Browser (React via CDN)
    |
    |  POST /api/chat  { messages, sessionId }
    v
Express Server (server.js)
    |
    |  POST https://api.groq.com/openai/v1/chat/completions
    |  Authorization: Bearer $GROQ_API_KEY
    v
Groq API (llama-3.3-70b-versatile)
    |
    +---> Supabase (session + prompt logging)
```

- **Backend:** Node.js + Express
- **Frontend:** Single-file React app (`public/index.html`) - no build step
- **AI:** Groq API (Llama 3.3 70B)
- **Database:** Supabase (PostgreSQL) for session persistence and analytics
- **Styling:** Brutalist corporate theme with Playfair Display + Courier Prime fonts

---

## Anti-Cheat & Integrity

| Measure | Behaviour |
|---|---|
| **Server-side scoring** | All scores computed on the server - the browser cannot manipulate them |
| **Ethics filter** | Detects bribery, fraud, embezzlement, etc. - first offense penalises, second terminates the session |
| **Paste disabled** | Ctrl+V is blocked in the input field |
| **Tab switch detection** | Switching tabs triggers a logged warning overlay |
| **Fullscreen enforcement** | Session enters fullscreen; exiting twice = immediate rejection |
| **Right-click disabled** | Context menu blocked during active sessions |

---

## Setup

### Prerequisites

- Node.js >= 18
- A free [Groq API key](https://console.groq.com/)
- *(Optional)* A [Supabase](https://supabase.com/) project for session logging

### Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Add your GROQ_API_KEY (required)
# Add SUPABASE_URL + SUPABASE_SERVICE_KEY (optional)

# 3. Start the server
npm start
# -> http://localhost:3000
```

### Supabase Setup (Optional)

If you want session data persisted to a database, run `supabase_setup.sql` in your Supabase SQL Editor. This creates:

- **`sessions`** - team name, total score, verdict, aspects covered
- **`prompts`** - each message, AI response, score delta, aspects addressed

Without Supabase credentials, the app runs fully in-memory with no data loss during a session.

---

## Deployment

### Render (Free Tier)

1. Push to GitHub
2. Render -> New -> Web Service -> connect repo
3. **Build command:** `npm install`
4. **Start command:** `node server.js`
5. Add environment variable: `GROQ_API_KEY`
6. Deploy

### Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway variables set GROQ_API_KEY=gsk_...
```

### Any Node.js Host

Set `GROQ_API_KEY` as an environment variable and run `node server.js`. Works on Vercel (serverless adapter needed), Fly.io, DigitalOcean App Platform, etc.

---

## Configuration

Edit `server.js` to customise:

| Variable | Default | Description |
|---|---|---|
| `MAX_PROMPTS` | 8 (1 opener + 7 user) | Total message exchanges |
| `SESSION_TTL` | 30 min | Server-side session expiry |
| `APPROVAL_THRESHOLD` | 62% (in `index.html`) | Conviction % needed to pass |
| System prompt | Bottom of `server.js` | Full AI persona, rubric, curveballs |

---

## Project Structure

```
indigo-boardroom/
├── server.js              # Express API, AI system prompt, scoring engine, ethics filter
├── public/
│   └── index.html         # Full React frontend (single file, no build step)
├── supabase_setup.sql     # Database schema for Supabase
├── .env.example           # Environment variable template
├── .gitignore
├── package.json
└── test.js                # API connection test script
```

---

## License

MIT
