import assert from 'node:assert/strict'
import {
  evaluateMindMapLearningQuality,
  validateMindMapGraph,
} from '../src/lib/mindmapValidation.js'

const rawGraph = {
  nodes: [
    {
      id: 'node_1',
      label: 'Neural network',
      detail: 'A model made of layers.',
      group: 'core',
      importance: 3,
      sources: [{ pageIndex: 0, quote: 'Neural networks are models made of layers.' }],
    },
    {
      id: 'node_2',
      label: 'Backpropagation',
      detail: 'Updates weights using gradients.',
      group: 'process',
      importance: 3,
      sources: [{ pageIndex: 2, quote: 'Backpropagation computes gradients.' }],
    },
    {
      id: 'node_2',
      label: 'Duplicate',
    },
    {
      id: 'empty_label',
      label: '   ',
    },
    {
      id: 'node_3',
      label: 'Overfitting',
      importance: 2,
      sources: [{ pageIndex: -1, quote: 'invalid page' }],
    },
  ],
  edges: [
    {
      id: 'edge_1',
      from: 'node_1',
      to: 'node_2',
      label: 'trained by',
      type: 'related',
    },
    {
      id: 'edge_2',
      from: 'node_1',
      to: 'missing_node',
      label: 'invalid',
    },
    {
      id: 'edge_3',
      from: 'node_1',
      to: 'node_2',
      label: 'trained by',
    },
  ],
}

const result = validateMindMapGraph(rawGraph, { requireSources: true })

assert.equal(result.ok, true)
assert.deepEqual(result.nodes.map((node) => node.id), ['node_1', 'node_2', 'node_3'])
assert.equal(result.rootId, 'node_1')
assert.equal(result.nodes[0].root, true)
assert.equal(result.nodes[0].level, 0)
assert.equal(result.edges.length, 1)
assert.equal(result.edges[0].from, 'node_1')
assert.equal(result.edges[0].to, 'node_2')
assert.ok(result.warnings.some((warning) => warning.type === 'duplicate_node'))
assert.ok(result.warnings.some((warning) => warning.type === 'dropped_node'))
assert.ok(result.warnings.some((warning) => warning.type === 'dropped_edge'))
assert.ok(result.warnings.some((warning) => warning.type === 'duplicate_edge'))
assert.ok(result.warnings.some((warning) => warning.type === 'missing_source' && warning.id === 'node_3'))
assert.ok(result.warnings.some((warning) => warning.type === 'unreachable_nodes'))

const empty = validateMindMapGraph({ nodes: [], edges: [] })
assert.equal(empty.ok, false)
assert.deepEqual(empty.nodes, [])
assert.deepEqual(empty.edges, [])

const learningFlow = validateMindMapGraph({
  nodes: [
    { id: 'root', label: 'AI 학습', root: true, level: 0, group: 'root', importance: 3, sources: [{ pageIndex: 0, quote: 'AI learning starts with a problem.' }] },
    { id: 'concept', label: '문제 정의', level: 1, group: 'core', importance: 3, sources: [{ pageIndex: 0, quote: 'Define the problem first.' }] },
    { id: 'detail', label: '데이터 연결', level: 2, group: 'structure', importance: 2, sources: [{ pageIndex: 1, quote: 'Data connects the model to context.' }] },
    { id: 'example', label: '활용 예시', level: 3, group: 'example', importance: 1 },
  ],
  edges: [
    { id: 'e1', from: 'root', to: 'concept', label: '시작', type: 'contains' },
    { id: 'e2', from: 'concept', to: 'detail', label: '구성', type: 'contains' },
    { id: 'e3', from: 'detail', to: 'example', label: '예시', type: 'exemplifies' },
  ],
}, { requireSources: true })

assert.equal(learningFlow.ok, true)
assert.equal(learningFlow.rootId, 'root')
assert.equal(learningFlow.quality.rootCount, 1)
assert.equal(learningFlow.quality.reachableRatio, 1)
assert.equal(learningFlow.quality.backwardEdgeCount, 0)
assert.equal(learningFlow.quality.hasCycle, false)
assert.ok(learningFlow.quality.sourceCoverage >= 0.75)
assert.equal(learningFlow.warnings.length, 0)

const weakFlow = evaluateMindMapLearningQuality(
  [
    { id: 'root', label: 'Root', root: true, level: 0, importance: 3, sources: [] },
    { id: 'a', label: 'A', level: 1, importance: 2, sources: [] },
    { id: 'b', label: 'B', level: 1, importance: 2, sources: [] },
  ],
  [
    { id: 'e1', from: 'a', to: 'root', label: 'back', type: 'related' },
    { id: 'e2', from: 'root', to: 'a', label: 'rel', type: 'related' },
  ],
  { rootId: 'root', requireSources: true }
)

assert.ok(weakFlow.warnings.some((warning) => warning.type === 'unreachable_nodes'))
assert.ok(weakFlow.warnings.some((warning) => warning.type === 'backward_edges'))
assert.ok(weakFlow.warnings.some((warning) => warning.type === 'too_many_related_edges'))
assert.ok(weakFlow.warnings.some((warning) => warning.type === 'low_source_coverage'))

console.log('Mind map validation tests passed')
