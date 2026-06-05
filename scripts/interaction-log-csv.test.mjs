import assert from 'node:assert/strict'
import { buildInteractionLogCsv, INTERACTION_LOG_CSV_HEADER } from '../src/lib/interactionLogCsv.js'

const logs = [
  {
    timestamp: { seconds: 1780660800 },
    clientTimestamp: '2026-06-05T12:00:01.000Z',
    eventType: 'chat_send',
    userId: 'user_a',
    sessionId: 'session_1',
    route: '/doc/doc_a?tab=chat',
    docId: 'doc_a',
    viewport: { width: 1280, height: 720 },
    metadata: {
      source: 'sidebar',
      note: 'comma, quote " and newline\nkept safe',
    },
  },
]

const csv = buildInteractionLogCsv(logs)
assert.equal(csv.charCodeAt(0), 0xfeff)

const lines = csv.slice(1).split('\r\n')
assert.equal(lines[0], INTERACTION_LOG_CSV_HEADER)
assert.equal(
  lines[0],
  'timestamp,clientTimestamp,eventType,userId,sessionId,route,docId,viewportWidth,viewportHeight,metadata',
)
assert.match(lines[1], /^2026-06-05T12:00:00\.000Z,2026-06-05T12:00:01\.000Z,chat_send,user_a,session_1/)
assert.match(lines[1], /,1280,720,/)
assert.match(lines[1], /\"\"/)
assert.doesNotMatch(lines[1], /\n/)

console.log('Interaction log CSV checks passed')
