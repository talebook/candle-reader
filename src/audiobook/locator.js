const ACTIVE_ATTRIBUTE = 'data-candle-audiobook-active'
const HIGHLIGHT_NAME = 'candle-audiobook'
const FALLBACK_CLASS = 'candle-audiobook-active'

export function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

export function findSegmentAt(segments, positionMs) {
  let left = 0
  let right = segments.length - 1
  let found = -1

  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    if (Number(segments[middle].start_ms) <= positionMs) {
      found = middle
      left = middle + 1
    } else {
      right = middle - 1
    }
  }

  if (found < 0) return null
  const segment = segments[found]
  return positionMs < Number(segment.end_ms) ? segment : null
}

function cleanHref(value) {
  const decoded = decodeURIComponent(String(value || '').split(/[?#]/)[0])
  return decoded.replace(/^\.\//, '').replace(/^\//, '')
}

function hrefMatches(left, right) {
  const a = cleanHref(left)
  const b = cleanHref(right)
  if (!a || !b) return false
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`) || a.split('/').pop() === b.split('/').pop()
}

export function contentHref(contents) {
  return contents?.section?.href || contents?.section?.url || contents?.document?.location?.pathname || ''
}

export function findContent(rendition, href) {
  const views = rendition?.views?.() || []
  let matchedView = null
  views.forEach?.((view) => {
    if (!matchedView && hrefMatches(view?.section?.href || view?.section?.url, href)) matchedView = view
  })
  if (matchedView?.contents) return matchedView.contents

  const items = rendition?.getContents?.() || []
  if (!href) return items[0] || null
  return items.find(item => hrefMatches(contentHref(item), href)) || null
}

function childrenByTag(parent, tagName) {
  return Array.from(parent?.children || []).filter(child => child.localName?.toLowerCase() === tagName)
}

export function resolveDomPath(document, domPath) {
  const parts = String(domPath || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  if (!parts.length) return null

  let current = document.documentElement
  for (const part of parts) {
    const match = part.match(/^([\w-]+)(?:\[(\d+)\])?$/)
    if (!match) return null
    const tagName = match[1].toLowerCase()
    const index = Math.max(0, Number(match[2] || 1) - 1)

    if (tagName === 'html') {
      current = document.documentElement
      continue
    }
    if (tagName === 'body') {
      current = document.body
      continue
    }
    current = childrenByTag(current, tagName)[index]
    if (!current) return null
  }
  return current
}

function findByText(document, text) {
  const needle = normalizeText(text)
  if (!needle) return null
  const candidates = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, div')
  return Array.from(candidates).find((element) => {
    const candidate = normalizeText(element.textContent)
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate)
  }) || null
}

export function resolveLocator(contents, segment) {
  const document = contents?.document
  const locator = segment?.locator || {}
  if (!document) return null

  let element = locator.element_id ? document.getElementById(locator.element_id) : null
  if (!element && locator.dom_path) element = resolveDomPath(document, locator.dom_path)
  if (!element) element = findByText(document, segment.text)
  return element ? { document, element, locator } : null
}

function textNodes(element) {
  const nodes = []
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    nodes.push(node)
    node = walker.nextNode()
  }
  return nodes
}

function pointAt(nodes, offset) {
  let remaining = Math.max(0, offset)
  for (const node of nodes) {
    if (remaining <= node.data.length) return { node, offset: remaining }
    remaining -= node.data.length
  }
  const last = nodes[nodes.length - 1]
  return last ? { node: last, offset: last.data.length } : null
}

export function createTextRange(element, startChar, endChar) {
  const nodes = textNodes(element)
  if (!nodes.length) return null
  const total = nodes.reduce((sum, node) => sum + node.data.length, 0)
  const start = Math.min(total, Math.max(0, Number(startChar) || 0))
  const requestedEnd = Number(endChar)
  const end = Math.min(total, Number.isFinite(requestedEnd) && requestedEnd > start ? requestedEnd : total)
  const startPoint = pointAt(nodes, start)
  const endPoint = pointAt(nodes, end)
  if (!startPoint || !endPoint) return null

  const range = element.ownerDocument.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  return range
}

function ensureHighlightStyle(document) {
  if (document.getElementById('candle-audiobook-highlight-style')) return
  const style = document.createElement('style')
  style.id = 'candle-audiobook-highlight-style'
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME}) {
      background: rgba(245, 166, 35, .34);
      text-decoration: underline 2px rgba(180, 92, 0, .75);
      text-underline-offset: .18em;
    }
    .${FALLBACK_CLASS} {
      background: rgba(245, 166, 35, .2) !important;
      box-shadow: inset 3px 0 rgba(180, 92, 0, .72);
    }
  `
  document.head.appendChild(style)
}

export function clearHighlights(rendition) {
  const contents = rendition?.getContents?.() || []
  contents.forEach((item) => {
    const document = item.document
    if (!document) return
    document.defaultView?.CSS?.highlights?.delete(HIGHLIGHT_NAME)
    document.querySelectorAll(`[${ACTIVE_ATTRIBUTE}]`).forEach((element) => {
      element.removeAttribute(ACTIVE_ATTRIBUTE)
      element.classList.remove(FALLBACK_CLASS)
    })
  })
}

export function applyHighlight(rendition, contents, segment) {
  clearHighlights(rendition)
  const resolved = resolveLocator(contents, segment)
  if (!resolved) return null

  const { document, element, locator } = resolved
  ensureHighlightStyle(document)
  element.setAttribute(ACTIVE_ATTRIBUTE, segment.id || '')
  element.classList.add(FALLBACK_CLASS)

  const range = createTextRange(element, locator.start_char, locator.end_char)
  const view = document.defaultView
  if (range && view?.CSS?.highlights && view.Highlight) {
    view.CSS.highlights.set(HIGHLIGHT_NAME, new view.Highlight(range))
  }
  element.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  return { contents, document, element, range }
}

export function chapterMatchesHref(chapter, href) {
  return hrefMatches(chapter?.source_key, href)
}

export function segmentMatchesElement(segment, element) {
  if (!segment || !element) return false
  if (segment.locator?.element_id && segment.locator.element_id === element.id) return true
  const segmentText = normalizeText(segment.text)
  const elementText = normalizeText(element.textContent)
  return Boolean(segmentText && elementText && (elementText.includes(segmentText) || segmentText.includes(elementText)))
}
