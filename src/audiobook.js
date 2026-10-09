// 有声书回调：清单、时间轴和收听进度都由宿主提供，阅读器不直接请求任何接口。契约见 DESIGN.md。
const REQUIRED = ['manifest', 'timeline']

export function createAudiobookRepository({ callbacks, bookId, bookUrl } = {}) {
  if (!callbacks) return null
  if (REQUIRED.some(name => typeof callbacks[name] !== 'function')) {
    throw new Error('audiobook_callbacks 必须同时提供 manifest 和 timeline 函数')
  }
  const context = { book_id: bookId || null, book_url: bookUrl || '' }
  const call = (name, query = {}) => callbacks[name]({ ...context, ...query })
  const has = name => typeof callbacks[name] === 'function'

  return {
    // → { manifest: { id, chapters: [...] }, progress: { chapter_id, position_ms, version } | null }
    async manifest() {
      const result = await call('manifest')
      const manifest = result?.manifest
      if (!manifest?.chapters?.length) throw new Error('当前书籍没有可播放章节')
      return { manifest, progress: result.progress || null }
    },
    // → 时间轴片段数组；宿主可以返回数组、{ segments } 或 { timeline: { segments } }
    async timeline(query) {
      const result = await call('timeline', query)
      const segments = Array.isArray(result) ? result : result?.segments || result?.timeline?.segments
      return Array.isArray(segments) ? segments : []
    },
    // 收听进度三个回调都是可选的；宿主不提供时只在本机记住位置。
    async startSession(query) {
      if (!has('start_session')) return ''
      const result = await call('start_session', query)
      return String(result?.session_id || '')
    },
    async reportProgress(query) {
      if (!has('report_progress')) return null
      const result = await call('report_progress', query)
      return result?.version ?? null
    },
    async endSession(query) {
      if (has('end_session')) await call('end_session', query)
    },
  }
}
