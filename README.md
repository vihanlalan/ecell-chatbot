# IndiGo Board Strategy Session

A competitive AI boardroom simulation for case competitions.

---

## Running Locally (as a plain HTML file)

1. Open `public/index.html` directly in Chrome or Edge
2. Enter your **free** Gemini API key when prompted
3. Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. The key is held in memory only — it is never stored

---

## Running as a Web Server (recommended for events)

The server keeps the API key out of the browser entirely.

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 3. Start the server
npm start
# → Running on http://localhost:3000
```

### Deploying to Render (free tier)

1. Push this folder to a GitHub repository
2. Go to render.com → New → Web Service
3. Connect your repository
4. Set the following:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
5. Add environment variable: `GEMINI_API_KEY` = your key
6. Deploy — Render gives you a public URL

### Deploying to Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway variables set GEMINI_API_KEY=AIzaSy...
```

### Deploying to Vercel / any Node host

Any Node.js 18+ host works. Set `GEMINI_API_KEY` as an
environment variable and run `node server.js`.

---

## Configuration

Edit `server.js` to change:
- `MAX_PROMPTS` — number of messages per team (default: 7)
- `SESSION_SECS` — session duration in seconds (default: 1500 = 25 min)
- `APPROVAL_PCT` — conviction threshold to approve (default: 62%)
- The system prompt at the bottom of `server.js`

---

## Architecture

```
Browser (public/index.html)
    │
    │  POST /api/chat  { messages: [...] }
    ▼
Express Server (server.js)
    │
    │  POST https://generativelanguage.googleapis.com/v1beta/...
    │  key=$GEMINI_API_KEY   ← never reaches the browser
    ▼
Google Gemini API
```

The API key never leaves the server. Participants interacting
with the deployed URL cannot extract it.
