const STORAGE_PREFIX = 'candle-reader:annotations:v1:'

function annotationIdentity(annotation) {
  return annotation.client_id || annotation.id
}

function createClientId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `candle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeLoadedAnnotations(result) {
  const annotations = Array.isArray(result) ? result : result?.annotations
  if (!Array.isArray(annotations)) throw new Error('读取笔记的回调必须返回数组或 { annotations }')
  return annotations
}

function normalizeSavedAnnotation(result) {
  const annotation = result?.annotation || result
  if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation)) {
    throw new Error('写入笔记的回调必须返回笔记对象或 { annotation }')
  }
  return annotation
}

function storageKey(bookId, bookUrl) {
  const identity = bookId || bookUrl || 'unknown-book'
  return `${STORAGE_PREFIX}${encodeURIComponent(String(identity))}`
}

export function createLocalAnnotationCallbacks({ bookId, bookUrl, storage } = {}) {
  const key = storageKey(bookId, bookUrl)
  let localStorage = storage
  if (localStorage === undefined) {
    try {
      localStorage = window.localStorage
    } catch (error) {
      throw new Error('浏览器禁止访问本地存储，无法保存笔记')
    }
  }
  if (!localStorage) throw new Error('浏览器不支持本地存储，无法保存笔记')

  function readAll() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(value) ? value : []
    } catch (error) {
      console.warn('Candle Reader 本地笔记损坏，已忽略：', error)
      return []
    }
  }

  return {
    async load({ chapter } = {}) {
      const annotations = readAll()
      if (!chapter) return annotations
      return annotations.filter(annotation => annotation.chapter === chapter)
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
      if (index >= 0) annotations.splice(index, 1, annotation)
      else annotations.push(annotation)
      localStorage.setItem(key, JSON.stringify(annotations))
      return annotation
    },
  }
}

export function createAnnotationCallbacks({ callbacks, bookId, bookUrl, storage } = {}) {
  const injected = callbacks != null
  if (injected && (typeof callbacks.load !== 'function' || typeof callbacks.save !== 'function')) {
    throw new Error('annotation_callbacks 必须同时提供 load 和 save 函数')
  }
  const implementation = injected ? callbacks : createLocalAnnotationCallbacks({ bookId, bookUrl, storage })
  const context = { book_id: bookId || null, book_url: bookUrl || '' }

  return {
    source: injected ? 'callback' : 'localStorage',
    async load(query = {}) {
      return normalizeLoadedAnnotations(await implementation.load({ ...context, ...query }))
    },
    async save(annotation) {
      return normalizeSavedAnnotation(await implementation.save({ ...annotation }, context))
    },
  }
}

export { createClientId }
