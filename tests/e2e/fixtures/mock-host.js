// e2e 用的宿主：在内存版宿主（demo/memory-host.js）上加固定的示例数据，以及记录调用、制造失败、挂起调用的测试开关。
import { createMemoryHost } from '/demo/memory-host.js'

const ME = { id: 1, nickname: '测试书友', avatar: '' }

// chapter 传 '*' 时示例评论出现在任意章节。
export function createMockHost({ guest = false, chapter = '*', paragraphCfi = '', extra = 0 } = {}) {
  const calls = []
  const failures = {}
  const delays = {}
  const host = createMemoryHost({
    user: guest ? null : ME,
    async intercept(name, query) {
      calls.push({ operation: name, query: JSON.parse(JSON.stringify(query || {})) })
      if (delays[name]) await new Promise(resolve => { delays[name] = resolve })
      if (failures[name]) throw new Error(failures[name])
    },
  })
  const stamp = minutes => new Date(Date.now() - minutes * 60000).toISOString()
  const record = (id, author, fields) => host.add({
    id, client_id: `seed-${id}`, chapter, cfi: paragraphCfi, range_cfi: paragraphCfi, quote_text: '被评论的原文',
    author_id: author === ME.nickname ? ME.id : id + 5000, author_name: author, created_at: stamp(id), ...fields,
  })
  record(1, '林间', { content: '有时我们缺少的不是风景，而是停下来的心情。', like_count: 12, dislike_count: 1 })
  record(2, ME.nickname, { content: '读到这里想到上周的散步。', like_count: 4 })
  record(3, ME.nickname, { annotation_type: 'highlight', is_private: true, quote_text: '我的私密划线原文' })
  record(4, '小舟', { content: '声音把这幅景象连在了一起。', like_count: 2 })
  record(5, ME.nickname, { content: '这一段适合留给忙碌时的自己。', is_private: true })
  record(6, '阿遥', { annotation_type: 'book_comment', chapter: '', content: '喜欢这本书安静的节奏。' })
  record(7, '南风', { chapter: '别的章节', content: '另一章的评论。' })
  record(901, '小舟', { root_id: 1, content: '同感，停下来本身就是一种风景。', like_count: 3 })
  record(902, ME.nickname, { root_id: 1, thread_id: 901, reply_to_id: 901, reply_to_name: '小舟', content: '所以这一段我读了两遍。' })
  record(903, '林间', { root_id: 1, thread_id: 901, reply_to_id: 902, reply_to_name: ME.nickname, content: '哈哈，我也是。', like_count: 1 })
  record(904, '阿遥', { root_id: 5, content: '忙的时候更需要这样的段落。' })
  for (let i = 0; i < extra; i++) record(100 + i, `书友${i}`, { content: `第 ${i + 1} 条补充评论` })

  return {
    callbacks: host.callbacks,
    calls,
    records: host.records,
    setUser(next) { host.setUser(next ? ME : null) },
    fail(name, message) { if (message) failures[name] = message; else delete failures[name] },
    // hold(name) 让下一次调用挂起，release(name) 放行。
    hold(name) { delays[name] = true },
    release(name) { const resolve = delays[name]; delete delays[name]; if (typeof resolve === 'function') resolve() },
  }
}
