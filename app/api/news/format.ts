type FormatOpts = {
  addBlankLineAfterLink?: boolean
}

// Formatting rules for readability in the UI.
export function formatMarkdown(md: string, opts: FormatOpts = {}): string {
  let s = (md || '').replace(/\r\n/g, '\n')

  // Normalize section headers (NO ** markdown; styling should be via UI/CSS)
  s = s.replace(/\n*(\[(KR|Global|Watchlist|One-liner)\])\n*/g, '\n\n$1\n\n')

  // If translation produced Korean section headers, normalize to the same canonical tags
  s = s
    .replace(/\n*\[한국\]\n*/g, '\n\n[KR]\n\n')
    .replace(/\n*\[글로벌\]\n*/g, '\n\n[Global]\n\n')
    .replace(/\n*\[주시 항목\]\n*/g, '\n\n[Watchlist]\n\n')
    .replace(/\n*\[한 줄 요약\]\n*/g, '\n\n[One-liner]\n\n')

  // Convert common label lines into headings (no ** markers)
  s = s
    // Title line
    .replace(/^\s*📰\s*(.+)\s*$/gmi, '# $1')
    // Version headings (match screenshot style)
    .replace(/^\s*🇰🇷\s*한국어 버전\s*$/gmi, '## 🇰🇷 한국어 버전')
    .replace(/^\s*🌍\s*English Version\s*$/gmi, '## 🌍 English Version')

    // Section tags as headings
    .replace(/^\s*\[KR\]\s*$/gmi, '### [KR]')
    .replace(/^\s*\[Global\]\s*$/gmi, '### [Global]')
    .replace(/^\s*\[Watchlist\]\s*$/gmi, '### [Watchlist]')
    .replace(/^\s*\[One-liner\]\s*$/gmi, '### [One-liner]')

    // Item title lines
    .replace(/^\s*제목\s*:\s*/gmi, '#### ')
    .replace(/^\s*Title\s*:\s*/gmi, '#### ')

    // Content sub-headings
    .replace(/^\s*요약\s*$/gmi, '#### 요약')
    .replace(/^\s*시사점\s*\(Why it matters\)\s*$/gmi, '#### 시사점 (Why it matters)')
    .replace(/^\s*Summary\s*$/gmi, '#### Summary')
    .replace(/^\s*Why it matters\s*$/gmi, '#### Why it matters')

  // Legacy bullet label forms
  s = s
    .replace(/^\s*-\s*Summary\s*:\s*/gmi, '')
    .replace(/^\s*-\s*Why it matters\s*:\s*/gmi, '')
    .replace(/^\s*-\s*Link\s*:\s*/gmi, 'Link: ')

  // Ensure link is always on its own line and rendered as a clickable <a>
  // Render as "🔗 <url>" (markdown link) like the PDF.
  s = s.replace(/-\s*Link\s*:\s*(https?:\/\/\S+)/g, (_m, url) => `\n🔗 [${url}](${url})`)

  // Also convert bare "Link: https://..." styles
  s = s.replace(/^\s*Link\s*:\s*(https?:\/\/\S+)\s*$/gmi, (_m, url) => `\n🔗 [${url}](${url})`)

  // Convert raw URL lines to the same format
  s = s.replace(/^\s*(https?:\/\/\S+)\s*$/gmi, (_m, url) => `🔗 [${url}](${url})`)

  if (opts.addBlankLineAfterLink) {
    // Add one blank line after link icon lines
    s = s.replace(/(\n🔗\s*\[[^\]]+\]\([^\)]+\))(\n)(?!\n)/g, '$1\n\n')
  }

  // Ensure clear separation before English section markers
  s = s.replace(/\n*(={10,})\n*/g, '\n\n$1\n\n')
  s = s.replace(/\n*(🌍\s*English Version)\n*/g, '\n\n$1\n\n')

  // Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, '\n\n')

  // Remove any stray bold markers (hard rule)
  s = s.replace(/\*\*/g, '')

  return s.trim()
}
