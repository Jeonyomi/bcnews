import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUsOpenDedupeKey,
  getUsOpenExecutionContext,
  isUsEquityHoliday,
} from '../lib/mbaiUsOpenConfig.ts'

test('US OPEN accepts 09:25 New York in both daylight and standard time', () => {
  const summer = getUsOpenExecutionContext(new Date('2026-08-27T13:25:00.000Z'))
  assert.deepEqual(summer, {
    dateKey: '2026-08-27', localTime: '09:25', weekday: 'Thu', isHoliday: false, shouldRun: true,
  })

  const winter = getUsOpenExecutionContext(new Date('2026-12-01T14:25:00.000Z'))
  assert.deepEqual(winter, {
    dateKey: '2026-12-01', localTime: '09:25', weekday: 'Tue', isHoliday: false, shouldRun: true,
  })
})

test('US OPEN rejects duplicate KST trigger, weekends, and NYSE holidays', () => {
  assert.equal(getUsOpenExecutionContext(new Date('2026-08-27T14:25:00.000Z')).shouldRun, false)
  assert.equal(getUsOpenExecutionContext(new Date('2026-08-27T13:31:00.000Z')).shouldRun, false)
  assert.equal(getUsOpenExecutionContext(new Date('2026-08-29T13:25:00.000Z')).shouldRun, false)
  assert.equal(isUsEquityHoliday('2026-11-26'), true)
  assert.equal(getUsOpenExecutionContext(new Date('2026-11-26T14:25:00.000Z')).shouldRun, false)
  assert.equal(buildUsOpenDedupeKey('2026-08-27'), 'mbai_us_open:2026-08-27')
})
