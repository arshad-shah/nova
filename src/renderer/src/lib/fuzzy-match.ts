export interface FuzzyMatch {
  score: number
  positions: number[]
}

/**
 * Subsequence fuzzy match. Returns null if any query char isn't found in order.
 * Score rewards: consecutive matches, matches at word boundaries, matches at
 * start of string. Lower score = better.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] }
  if (!target) return null

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Fast path: exact substring is always best
  const idx = t.indexOf(q)
  if (idx >= 0) {
    const positions: number[] = []
    for (let i = 0; i < q.length; i++) positions.push(idx + i)
    // Boost for start-of-string / word-boundary match
    let score = idx * 2
    if (idx === 0) score -= 100
    else if (isBoundary(t, idx)) score -= 30
    return { score, positions }
  }

  // Subsequence match
  const positions: number[] = []
  let qi = 0
  let lastIdx = -2
  let score = 0
  let streak = 0

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      positions.push(i)
      if (i === lastIdx + 1) {
        streak++
        score -= 5 + streak * 2
      } else {
        streak = 0
        score += i - lastIdx - 1
        if (i === 0 || isBoundary(t, i)) score -= 8
      }
      lastIdx = i
      qi++
    }
  }

  if (qi < q.length) return null
  return { score, positions }
}

/**
 * Case-insensitive substring test — the one home for the
 * `field.toLowerCase().includes(query.toLowerCase())` idiom that a dozen list
 * filters hand-rolled (each re-lowercasing the query per item). An empty query
 * matches everything.
 */
export function includesFold(target: string, query: string): boolean {
  if (!query) return true
  return target.toLowerCase().includes(query.toLowerCase())
}

/**
 * True when `query` (case-insensitively) is a substring of any of the given
 * fields. The query is lowered once, not per field. Nullish fields are skipped.
 * Use for multi-field list filtering (`matchesFilter(q, item.name, item.desc)`).
 */
export function matchesFilter(query: string, ...fields: (string | null | undefined)[]): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return fields.some((f) => f != null && f.toLowerCase().includes(q))
}

function isBoundary(s: string, i: number): boolean {
  if (i === 0) return true
  const prev = s[i - 1]
  return prev === '_' || prev === '-' || prev === '.' || prev === ' ' || prev === '/'
}
