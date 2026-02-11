export interface NewsItem {
  id: string
  title: string
  // Markdown content contains BOTH KO then EN versions.
  body: string
  source: string
  createdAt: string | Date
  updatedAt: string | Date
}
