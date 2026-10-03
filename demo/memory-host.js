// 纯内存版宿主：完整实现 annotation_callbacks 契约（见 README.md），多位读者、分页、投票与回复俱全。
// demo.html 用它做可离线体验的演示，e2e 的 mock-host.js 也基于它。刷新页面后数据即重置。
// 真实宿主是 Talebook；这里只是契约的参照实现，不代表任何后端的存储方式。

export function createMemoryHost({ user = null, pageSize = 20, intercept = null } = {}) {
  let current = user
  let seq = 100000
  const records = []

  const isMine = item => Boolean(current) && item.author_id === current.id
  const top = item => item.root_id ? records.find(other => other.id === item.root_id) : item
  // 回复没有独立的公开范围，跟随主评论；私密记录及其回复只有主评论作者可见。
  const visible = item => { const main = top(item); return Boolean(main) && (main.is_private === false || isMine(main)) }
  // chapter 为 '*' 的记录出现在任意章节。
  const inChapter = (item, chapter) => item.chapter === '*' || item.chapter === chapter
  const view = item => {
    const { votes, ...rest } = item
    return {
      ...rest,
      is_mine: isMine(item),
      user_vote: current ? votes[current.id] || 0 : 0,
      reply_count: item.root_id ? 0 : records.filter(other => other.root_id === item.id).length,
    }
  }
  const page = (items, cursor, limit) => {
    const start = Number(cursor) || 0
    const end = start + (Number(limit) || pageSize)
    return { items: items.slice(start, end).map(view), next_cursor: end < items.length ? String(end) : null, has_more: end < items.length }
  }
  const requireUser = () => { if (!current) throw new Error('请先登录') }
  const find = id => {
    const item = records.find(other => other.id === id)
    if (!item || !visible(item)) throw new Error('这条评论已不存在')
    return item
  }
  const enter = async (name, query) => { if (intercept) await intercept(name, query) }

  // 直接写入一条记录（用于准备演示或测试数据），不做权限校验。
  function add(fields) {
    const id = fields.id ?? ++seq
    const item = {
      id, client_id: `memory-${id}`, annotation_type: 'note', is_private: false, chapter: '*', cfi: '', range_cfi: '',
      quote_text: '', content: '', author_id: 0, author_name: '书友', created_at: new Date().toISOString(),
      like_count: 0, dislike_count: 0, votes: {}, root_id: null, thread_id: null, reply_to_id: null, reply_to_name: '',
      ...fields,
    }
    records.push(item)
    return item
  }

  const callbacks = {
    async user() { await enter('user'); return current },
    async login() { await enter('login') },
    async load(query) {
      await enter('load', query)
      return records.filter(item => !item.root_id && isMine(item) && (!query.chapter || inChapter(item, query.chapter))).map(view)
    },
    async list(query) {
      await enter('list', query)
      const { scope, chapter, paragraph_cfi: paragraph } = query
      const items = records.filter(item => !item.root_id).filter(item => {
        if (scope === 'mine') return isMine(item)
        if (item.is_private !== false) return false
        if (scope === 'book') return true
        if (item.annotation_type === 'book_comment' || !inChapter(item, chapter)) return false
        return scope !== 'paragraph' || item.cfi === paragraph
      // 自己的评论优先的排序覆盖整个结果集，再分页。
      }).sort((a, b) => (isMine(b) - isMine(a)) || String(b.created_at).localeCompare(String(a.created_at)))
      return page(items, query.cursor, query.limit)
    },
    async summary(query) {
      await enter('summary', query)
      const counts = {}
      records.forEach(item => {
        if (item.root_id || item.is_private !== false || item.annotation_type !== 'note' || !inChapter(item, query.chapter) || !item.cfi) return
        counts[item.cfi] = (counts[item.cfi] || 0) + 1
      })
      return Object.entries(counts).map(([cfi, count]) => ({ paragraph_cfi: cfi, count }))
    },
    async get(query) { await enter('get', query); return view(find(query.id)) },
    async replies(query) {
      await enter('replies', query)
      find(query.root_id)
      const items = records.filter(item => item.root_id === query.root_id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      return page(items, query.cursor, query.limit)
    },
    async save(input) {
      await enter('save', input)
      requireUser()
      const existing = records.find(item => (input.id && item.id === input.id) || item.client_id === input.client_id)
      if (existing) {
        if (!isMine(existing)) throw new Error('只能修改自己的评论')
        existing.content = input.content ?? existing.content
        if (!existing.root_id && input.is_private !== undefined) existing.is_private = existing.annotation_type === 'highlight' ? true : input.is_private
        return view(existing)
      }
      const fields = { ...input, id: ++seq, author_id: current.id, author_name: current.nickname, created_at: new Date().toISOString() }
      if (fields.root_id) {
        const main = find(fields.root_id)
        if (main.is_private !== false) throw new Error('私密记录不开放互动')
        const target = records.find(item => item.id === fields.reply_to_id && item.root_id === main.id)
        Object.assign(fields, { thread_id: target ? target.thread_id || target.id : null, reply_to_name: target ? target.author_name : '', is_private: false, chapter: main.chapter })
      } else if (fields.annotation_type === 'highlight') {
        fields.is_private = true
      }
      return view(add(fields))
    },
    async remove(query) {
      await enter('remove', query)
      requireUser()
      const item = find(query.id)
      if (!isMine(item)) throw new Error('只能删除自己的评论')
      // 真删除：主评论连同全部回复，第一层回复连同其下回复。
      for (let i = records.length - 1; i >= 0; i--) {
        const other = records[i]
        if (other.id === item.id || other.root_id === item.id || other.thread_id === item.id) records.splice(i, 1)
      }
      return { id: query.id }
    },
    async vote(query) {
      await enter('vote', query)
      requireUser()
      const item = find(query.id)
      if (top(item).is_private !== false) throw new Error('私密记录不开放互动')
      const before = item.votes[current.id] || 0
      item.like_count += (query.value === 1) - (before === 1)
      item.dislike_count += (query.value === -1) - (before === -1)
      item.votes[current.id] = query.value
      return { like_count: item.like_count, dislike_count: item.dislike_count, user_vote: query.value }
    },
  }

  return { callbacks, records, add, getUser: () => current, setUser(next) { current = next } }
}
