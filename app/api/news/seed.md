📰 Digital Asset & Stablecoin Regulatory Brief

## 🇰🇷 한국어 버전

[KR]
제목: (복구) 한국어 표시 문제 수정 중 — 다음 정규 브리프에서 최신 내용으로 갱신됩니다
#### 요약
- 웹에서 한국어가 깨져 보이는 문제가 확인되어 seed 파일 인코딩 경로를 수정했습니다.
- 다음 09:00/21:00 정규 메인 브리프 실행 시 최신 내용으로 자동 업데이트됩니다.
#### 시사점 (Why it matters)
- 운영 상 “정각 브리프 → seed 반영 → Vercel 배포 갱신” 파이프라인에서 인코딩이 깨지면 전체 UX가 망가집니다.
- seed 파일 쓰기 방식을 OpenClaw tools.write 기반으로 바꿔 재발을 차단합니다.
🔗 https://bcnews-agent.vercel.app/

[Global]
제목: (복구) Seed 인코딩 경로 수정 완료
#### 요약
- seed.md를 UTF-8로 안정적으로 저장하도록 파이프라인을 변경했습니다.
#### 시사점 (Why it matters)
- 한국어/이모지 포함 콘텐츠의 신뢰성을 확보합니다.
🔗 https://github.com/Jeonyomi/bcnews

[Watchlist]
- 다음 정규 메인 브리프(09:00/21:00 KST) 실행 시 한국어 렌더링 정상 여부
- Vercel 배포 후 /api/news 응답에 한글이 정상 포함되는지

[One-liner]
한국어 깨짐은 seed 파일 저장 경로 문제였고, tools.write로 변경해 재발을 막습니다.

====================================================================

## 🌍 English Version

[KR]
Title: (Recovery) Fixing Korean text rendering — will be refreshed by the next scheduled brief
#### Summary
- We detected mojibake in the deployed seed content and patched the seed write path.
- The next scheduled main brief (09:00/21:00 KST) will overwrite this recovery note with fresh content.
#### Why it matters
- If seed encoding breaks, the entire UI becomes unreadable.
- We’re switching to OpenClaw tools.write for stable UTF-8 handling.
🔗 https://bcnews-agent.vercel.app/

[Global]
Title: (Recovery) Seed write path updated for stable UTF-8
#### Summary
- seed.md is now written via a UTF-8 safe path.
#### Why it matters
- Reliable multilingual rendering (KR/emoji) on Vercel.
🔗 https://github.com/Jeonyomi/bcnews

[Watchlist]
- Confirm KR rendering on the next scheduled main brief
- Verify /api/news returns proper UTF-8 Korean

[One-liner]
The issue was in the seed write path; switching to tools.write should prevent recurrence.
