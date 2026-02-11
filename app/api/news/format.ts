type FormatOpts = {
  addBlankLineAfterLink?: boolean
}

// Formatting rules for readability in the UI.
export function formatMarkdown(md: string, opts: FormatOpts = {}): string {
  let s = (md || '').replace(/\r\n/g, '\n')

  // Bold section headers
  s = s.replace(/\n*(\[(KR|Global|Watchlist|One-liner)\])\n*/g, '\n\n**$1**\n\n')

  // Make labels consistent
  s = s
    .replace(/^\s*-\s*Summary\s*:\s*/gmi, '- **Summary:** ')
    .replace(/^\s*-\s*Why it matters\s*:\s*/gmi, '- **Why it matters:** ')
    .replace(/^\s*-\s*Link\s*:\s*/gmi, '- **Link:** ')

  // Ensure link is always on a new line and rendered as a clickable <a>
  s = s.replace(
    /- \*\*Link:\*\*\s*(https?:\/\/\S+)/g,
    (_m, url) => `- **Link:**\n[${url}](${url})`
  )

  if (opts.addBlankLineAfterLink) {
    // Add one blank line after raw URL link lines
    s = s.replace(/(\nhttps?:\/\/\S+)(\n)(?!\n)/g, '$1\n\n')
  }

  // Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}
