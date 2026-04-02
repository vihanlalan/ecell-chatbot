-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  team_name TEXT NOT NULL,
  total_score INTEGER DEFAULT 0,
  max_score INTEGER DEFAULT 90,
  verdict TEXT,  -- 'approved' or 'rejected' or null if ongoing
  verdict_line TEXT,
  aspects_covered TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prompts table
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  prompt_number INTEGER NOT NULL,
  user_message TEXT,
  ai_response TEXT,
  delta INTEGER DEFAULT 0,
  score_after INTEGER DEFAULT 0,
  aspects_covered TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_team ON sessions(team_name);

-- Enable RLS (Row Level Security) but allow service role full access
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- Policy: service role can do everything
CREATE POLICY "Service role full access sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access prompts" ON prompts FOR ALL USING (true) WITH CHECK (true);
