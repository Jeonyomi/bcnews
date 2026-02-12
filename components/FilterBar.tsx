'use client'

import { Region, Topic } from '@/types'

const TOPICS: Topic[] = [
  'Regulation/Policy',
  'Stablecoin Issuers/Reserves',
  'Banks/Payments',
  'Market/Trading',
  'CBDC/Tokenized Cash',
  'Enforcement/Crime',
  'Infra/Tech'
]

interface Props {
  selectedRegion: Region | 'all'
  selectedTopic: Topic | 'all'
  onRegionChange: (region: Region | 'all') => void
  onTopicChange: (topic: Topic | 'all') => void
}

export function FilterBar({
  selectedRegion,
  selectedTopic,
  onRegionChange,
  onTopicChange
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Region:</span>
        <select
          value={selectedRegion}
          onChange={(e) => onRegionChange(e.target.value as Region | 'all')}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="all">All</option>
          <option value="KR">Korea</option>
          <option value="Global">Global</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Topic:</span>
        <select
          value={selectedTopic}
          onChange={(e) => onTopicChange(e.target.value as Topic | 'all')}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="all">All Topics</option>
          {TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}