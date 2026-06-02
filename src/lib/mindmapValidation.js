function cleanText(value, maxLength = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

const VALID_GROUPS = new Set(['root', 'core', 'process', 'structure', 'effect', 'example', 'application'])
const VALID_EDGE_TYPES = new Set(['contains', 'causes', 'exemplifies', 'contrasts', 'related'])

function normalizeNode(raw, index) {
  const id = cleanText(raw?.id || `node_${index + 1}`, 80)
  const label = cleanText(raw?.label, 80)
  if (!id || !label) return null

  const importance = Number(raw?.importance)
  const level = Number(raw?.level)
  const group = cleanText(raw?.group || 'core', 40)
  const normalized = {
    ...raw,
    id,
    label,
    detail: cleanText(raw?.detail, 320),
    group: VALID_GROUPS.has(group) ? group : 'core',
    importance: [1, 2, 3].includes(importance) ? importance : 2,
    level: Number.isInteger(level) && level >= 0 ? Math.min(level, 4) : null,
    root: raw?.root === true || id === 'root',
    sources: normalizeSources(raw?.sources),
  }

  return normalized
}

function normalizeSources(rawSources) {
  if (!Array.isArray(rawSources)) return []

  return rawSources
    .map((source) => {
      const pageIndex = Number(source?.pageIndex)
      const quote = cleanText(source?.quote, 220)
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || !quote) return null
      return { pageIndex, quote }
    })
    .filter(Boolean)
    .slice(0, 3)
}

function normalizeEdge(raw, index, nodeIds) {
  const from = cleanText(raw?.from, 80)
  const to = cleanText(raw?.to, 80)
  if (!from || !to || from === to) return null
  if (!nodeIds.has(from) || !nodeIds.has(to)) return null

  return {
    ...raw,
    id: cleanText(raw?.id || `edge_${index + 1}`, 80),
    from,
    to,
    label: cleanText(raw?.label || 'related', 80),
    type: VALID_EDGE_TYPES.has(cleanText(raw?.type || 'related', 40))
      ? cleanText(raw?.type || 'related', 40)
      : 'related',
  }
}

export function validateMindMapGraph(rawGraph, { requireSources = false } = {}) {
  const rawNodes = Array.isArray(rawGraph?.nodes) ? rawGraph.nodes : []
  const nodeMap = new Map()
  const warnings = []

  rawNodes.forEach((rawNode, index) => {
    const node = normalizeNode(rawNode, index)
    if (!node) {
      warnings.push({ type: 'dropped_node', index })
      return
    }
    if (nodeMap.has(node.id)) {
      warnings.push({ type: 'duplicate_node', id: node.id })
      return
    }
    if (requireSources && node.importance >= 2 && node.sources.length === 0) {
      warnings.push({ type: 'missing_source', id: node.id })
    }
    nodeMap.set(node.id, node)
  })

  const rootId = chooseRootId([...nodeMap.values()], warnings)
  if (rootId) {
    for (const node of nodeMap.values()) {
      if (node.id === rootId) {
        node.root = true
        node.level = 0
        node.group = 'root'
        node.importance = 3
      } else {
        node.root = false
        if (node.level === 0 || node.level == null) node.level = Math.max(1, inferLevel(node, rootId))
      }
    }
  }

  const nodeIds = new Set(nodeMap.keys())
  const rawEdges = Array.isArray(rawGraph?.edges) ? rawGraph.edges : []
  const edgeMap = new Map()

  rawEdges.forEach((rawEdge, index) => {
    const edge = normalizeEdge(rawEdge, index, nodeIds)
    if (!edge) {
      warnings.push({ type: 'dropped_edge', index })
      return
    }
    const key = `${edge.from}->${edge.to}:${edge.label}`
    if (edgeMap.has(key)) {
      warnings.push({ type: 'duplicate_edge', id: edge.id })
      return
    }
    edgeMap.set(key, edge)
  })

  const nodes = [...nodeMap.values()]
  const edges = [...edgeMap.values()]
  const quality = evaluateMindMapLearningQuality(nodes, edges, { rootId, requireSources })
  warnings.push(...quality.warnings)

  return {
    nodes,
    edges,
    rootId,
    quality: quality.metrics,
    warnings,
    ok: nodes.length > 0,
  }
}

function chooseRootId(nodes, warnings) {
  if (nodes.length === 0) return null

  const explicitRoots = nodes.filter((node) => node.root || node.level === 0)
  if (explicitRoots.length > 1) {
    warnings.push({ type: 'multiple_roots', ids: explicitRoots.map((node) => node.id) })
  }
  if (explicitRoots.length > 0) return explicitRoots[0].id

  const important = nodes.find((node) => node.importance === 3)
  if (important) {
    warnings.push({ type: 'inferred_root', id: important.id })
    return important.id
  }

  warnings.push({ type: 'inferred_root', id: nodes[0].id })
  return nodes[0].id
}

function inferLevel(node, rootId) {
  if (node.id === rootId) return 0
  if (node.importance >= 3) return 1
  if (node.importance === 2) return 2
  return 3
}

export function evaluateMindMapLearningQuality(nodes = [], edges = [], { rootId = null, requireSources = false } = {}) {
  const warnings = []
  const nodeIds = new Set(nodes.map((node) => node.id))
  const adjacency = new Map(nodes.map((node) => [node.id, []]))
  edges.forEach((edge) => {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      adjacency.get(edge.from)?.push(edge.to)
    }
  })

  const roots = nodes.filter((node) => node.root || node.level === 0)
  const selectedRootId = rootId || roots[0]?.id || null
  const reachable = selectedRootId ? collectReachable(selectedRootId, adjacency) : new Set()
  const sourceCovered = nodes.filter((node) => node.importance < 2 || node.sources?.length > 0).length
  const relatedEdges = edges.filter((edge) => edge.type === 'related').length
  const backwardEdges = edges.filter((edge) => {
    const fromLevel = nodes.find((node) => node.id === edge.from)?.level
    const toLevel = nodes.find((node) => node.id === edge.to)?.level
    return Number.isInteger(fromLevel) && Number.isInteger(toLevel) && fromLevel >= toLevel
  })
  const hasCycle = selectedRootId ? detectsCycle(selectedRootId, adjacency) : false

  if (nodes.length > 0 && roots.length !== 1) warnings.push({ type: 'root_count', count: roots.length })
  if (nodes.length > 0 && reachable.size < nodes.length) {
    warnings.push({ type: 'unreachable_nodes', count: nodes.length - reachable.size })
  }
  if (backwardEdges.length > 0) {
    warnings.push({ type: 'backward_edges', ids: backwardEdges.map((edge) => edge.id) })
  }
  if (hasCycle) warnings.push({ type: 'cycle_detected' })
  if (edges.length > 0 && relatedEdges / edges.length > 0.35) {
    warnings.push({ type: 'too_many_related_edges', ratio: relatedEdges / edges.length })
  }
  if (requireSources && nodes.length > 0 && sourceCovered / nodes.length < 0.7) {
    warnings.push({ type: 'low_source_coverage', ratio: sourceCovered / nodes.length })
  }

  return {
    warnings,
    metrics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      rootCount: roots.length,
      reachableRatio: nodes.length ? reachable.size / nodes.length : 0,
      sourceCoverage: nodes.length ? sourceCovered / nodes.length : 0,
      relatedEdgeRatio: edges.length ? relatedEdges / edges.length : 0,
      backwardEdgeCount: backwardEdges.length,
      hasCycle,
    },
  }
}

function collectReachable(rootId, adjacency) {
  const seen = new Set()
  const queue = [rootId]
  while (queue.length) {
    const id = queue.shift()
    if (seen.has(id)) continue
    seen.add(id)
    for (const next of adjacency.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next)
    }
  }
  return seen
}

function detectsCycle(rootId, adjacency) {
  const visiting = new Set()
  const visited = new Set()

  function visit(id) {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }

  return visit(rootId)
}
