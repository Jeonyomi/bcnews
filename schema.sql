-- RLS 재설정
ALTER TABLE news_briefs DISABLE ROW LEVEL SECURITY;
ALTER TABLE news_briefs ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Allow authenticated read" ON news_briefs;
DROP POLICY IF EXISTS "Allow service_role all" ON news_briefs;

-- 새로운 정책: 누구나 읽기 가능
CREATE POLICY "Allow public read" ON news_briefs
    FOR SELECT
    TO PUBLIC
    USING (true);

-- service_role은 모든 작업 가능
CREATE POLICY "Allow service_role all" ON news_briefs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);