const STORAGE_PREFIX = 'candle-reader:annotations:v1:'
const PAGE_SIZE = 20
const LOCAL_USER = { id: 'local', nickname: '我', avatar: '' }
// 宿主必须提供的回调；其余回调缺失时，对应功能给出明确错误而不是静默降级到本地。
const REQUIRED = ['load', 'save']

function annotationIdentity(annotation) {
  return annotation.client_id || annotation.id
}

function createClientId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `candle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeLoadedAnnotations(result) {
  const annotations = Array.isArray(result) ? result : result?.annotations
  if (!Array.isArray(annotations)) throw new Error('读取评论的回调必须返回数组或 { annotations }')
  return annotations
}

function normalizeSavedAnnotation(result) {
  const annotation = result?.annotation || result
  if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation)) {
    throw new Error('写入评论的回调必须返回评论对象或 { annotation }')
  }
  return annotation
}

function normalizePage(result) {
  const items = Array.isArray(result) ? result : result?.items
  if (!Array.isArray(items)) throw new Error('评论列表回调必须返回数组或 { items, next_cursor, has_more }')
  const next = Array.isArray(result) ? null : result.next_cursor ?? null
  return { items, next_cursor: next, has_more: Array.isArray(result) ? false : Boolean(result.has_more ?? next) }
}

function storageKey(bookId, bookUrl) {
  const identity = bookId || bookUrl || 'unknown-book'
  return `${STORAGE_PREFIX}${encodeURIComponent(String(identity))}`
}

function paginate(records, cursor, limit) {
  const start = Number(cursor) || 0
  const size = Number(limit) || PAGE_SIZE
  const end = start + size
  return { items: records.slice(start, end), next_cursor: end < records.length ? String(end) : null, has_more: end < records.length }
}

// 未注入宿主回调时的本地实现：只有当前浏览器这一位读者，公开范围不会真的对他人生效。
export function createLocalAnnotationCallbacks({ bookId, bookUrl, storage } = {}) {
  const key = storageKey(bookId, bookUrl)
  let localStorage = storage
  if (localStorage === undefined) {
    try {
      localStorage = window.localStorage
    } catch (error) {
      throw new Error('浏览器禁止访问本地存储，无法保存评论')
    }
  }
  if (!localStorage) throw new Error('浏览器不支持本地存储，无法保存评论')

  function readAll() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(value) ? value : []
    } catch (error) {
      console.warn('Candle Reader 本地评论损坏，已忽略：', error)
      return []
    }
  }

  function writeAll(annotations) {
    localStorage.setItem(key, JSON.stringify(annotations))
  }

  function decorate(annotation, all) {
    return {
      like_count: 0,
      dislike_count: 0,
      user_vote: 0,
      ...annotation,
      is_mine: true,
      author_name: LOCAL_USER.nickname,
      reply_count: annotation.root_id ? 0 : all.filter(item => item.root_id === annotation.id).length,
    }
  }

  const newestFirst = (a, b) => String(b.created_at).localeCompare(String(a.created_at))

  return {
    async user() {
      return LOCAL_USER
    },
    async load({ chapter } = {}) {
      const annotations = readAll().filter(annotation => !annotation.root_id)
      if (!chapter) return annotations
      return annotations.filter(annotation => annotation.chapter === chapter)
    },
    async list({ scope = 'chapter', chapter, paragraph_cfi: paragraphCfi, cursor, limit } = {}) {
      const all = readAll()
      const top = all.filter(annotation => !annotation.root_id).filter(annotation => {
        if (scope === 'mine') return true
        if (annotation.is_private !== false) return false
        if (scope === 'book') return true
        if (annotation.annotation_type === 'book_comment' || annotation.chapter !== chapter) return false
        return scope !== 'paragraph' || annotation.cfi === paragraphCfi
      }).sort(newestFirst)
      const page = paginate(top, cursor, limit)
      return { ...page, items: page.items.map(annotation => decorate(annotation, all)) }
    },
    async summary({ chapter } = {}) {
      const counts = {}
      readAll().forEach(annotation => {
        if (annotation.root_id || annotation.is_private !== false || annotation.chapter !== chapter) return
        if (annotation.annotation_type !== 'note' || !annotation.cfi) return
        counts[annotation.cfi] = (counts[annotation.cfi] || 0) + 1
      })
      return Object.entries(counts).map(([cfi, count]) => ({ paragraph_cfi: cfi, count }))
    },
    async get({ id }) {
      const all = readAll()
      const annotation = all.find(item => item.id === id)
      if (!annotation) throw new Error('这条评论已不存在')
      return decorate(annotation, all)
    },
    async replies({ root_id: rootId, cursor, limit } = {}) {
      const all = readAll()
      const replies = all.filter(annotation => annotation.root_id === rootId).sort((a, b) => newestFirst(b, a))
      const page = paginate(replies, cursor, limit)
      return { ...page, items: page.items.map(annotation => decorate(annotation, all)) }
    },
    async save(input) {
      const now = new Date().toISOString()
      const annotations = readAll()
      const identity = annotationIdentity(input) || createClientId()
      const index = annotations.findIndex(annotation => annotationIdentity(annotation) === identity)
      const previous = index >= 0 ? annotations[index] : null
      const annotation = {
        ...previous,
        ...input,
        id: previous?.id || input.id || identity,
        client_id: input.client_id || previous?.client_id || identity,
        created_at: previous?.created_at || input.created_at || now,
        updated_at: now,
      }
      if (annotation.root_id && !previous) {
        const target = annotations.find(item => item.id === annotation.reply_to_id && item.root_id === annotation.root_id)
        annotation.thread_id = target ? target.thread_id || target.id : null
        annotation.reply_to_name = target ? LOCAL_USER.nickname : ''
      }
      if (index >= 0) annotations.splice(index, 1, annotation)
      else annotations.push(annotation)
      writeAll(annotations)
      return decorate(annotation, annotations)
    },
    async remove({ id }) {
      // 真删除：主评论连同全部回复，第一层回复连同其下回复。
      writeAll(readAll().filter(item => item.id !== id && item.root_id !== id && item.thread_id !== id))
      return { id }
    },
    async vote({ id, value }) {
      const annotations = readAll()
      const annotation = annotations.find(item => item.id === id)
      if (!annotation) throw new Error('这条评论已不存在')
      annotation.user_vote = value
      annotation.like_count = value === 1 ? 1 : 0
      annotation.dislike_count = value === -1 ? 1 : 0
      writeAll(annotations)
      return { like_count: annotation.like_count, dislike_count: annotation.dislike_count, user_vote: value }
    },
  }
}

export function createAnnotationCallbacks({ callbacks, bookId, bookUrl, storage } = {}) {
  const injected = callbacks != null
  if (injected && REQUIRED.some(name => typeof callbacks[name] !== 'function')) {
    throw new Error('annotation_callbacks 必须同时提供 load 和 save 函数')
  }
  const implementation = injected ? callbacks : createLocalAnnotationCallbacks({ bookId, bookUrl, storage })
  const context = { book_id: bookId || null, book_url: bookUrl || '' }
  const call = (name, query = {}) => {
    if (typeof implementation[name] !== 'function') throw new Error(`宿主未提供 ${name} 回调，无法完成该操作`)
    return implementation[name]({ ...context, ...query }, context)
  }

  return {
    source: injected ? 'callback' : 'localStorage',
    async user() {
      return implementation.user ? (await call('user')) || null : null
    },
    async login() {
      if (implementation.login) await call('login')
    },
    async load(query = {}) {
      return normalizeLoadedAnnotations(await call('load', query))
    },
    async list(query = {}) {
      return normalizePage(await call('list', query))
    },
    async summary(query = {}) {
      const result = await call('summary', query)
      const items = Array.isArray(result) ? result : result?.items
      return Array.isArray(items) ? items : []
    },
    async get(query) {
      return normalizeSavedAnnotation(await call('get', query))
    },
    async replies(query = {}) {
      return normalizePage(await call('replies', query))
    },
    async save(annotation) {
      return normalizeSavedAnnotation(await implementation.save({ ...annotation }, context))
    },
    async remove(query) {
      return call('remove', query)
    },
    async vote(query) {
      const result = await call('vote', query)
      if (!result || typeof result !== 'object') throw new Error('投票回调必须返回 { like_count, dislike_count, user_vote }')
      return result
    },
  }
}

export { createClientId }
