-- 001_extend_news_briefs.sql
-- Extends news_briefs table with region, source, KST time, score and topics

-- Add new columns
ALTER TABLE news_briefs
ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'KR',
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'main',
ADD COLUMN IF NOT EXISTS created_at_kst timestamptz GENERATED ALWAYS AS (created_at AT TIME ZONE 'Asia/Seoul') STORED,
ADD COLUMN IF NOT EXISTS score smallint,
ADD COLUMN IF NOT EXISTS topics text[];

-- Add indexes for filtering/sorting
CREATE INDEX IF NOT EXISTS idx_briefs_region ON news_briefs(region);
CREATE INDEX IF NOT EXISTS idx_briefs_source ON news_briefs(source);
CREATE INDEX IF NOT EXISTS idx_briefs_score ON news_briefs(score DESC NULLS LAST);

-- Add constraint to ensure region is either 'KR' or 'Global'
ALTER TABLE news_briefs
ADD CONSTRAINT check_region CHECK (region IN ('KR', 'Global'));

-- Add constraint to ensure source is either 'main' or 'backup'
ALTER TABLE news_briefs
ADD CONSTRAINT check_source CHECK (source IN ('main', 'backup'));