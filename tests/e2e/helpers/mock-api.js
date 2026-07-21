// 后端接口 mock。candle-reader 通过 $backend(server + url) 请求 talebook 后端，
// 这里用 Playwright route 拦截所有 /api/** 请求并返回受控 JSON，
// 使 UI 测试不依赖真实服务、结果可复现。

// 默认的“游客（未登录）”后端状态
const GUEST_RESPONSES = {
  'GET /api/review/me': { err: 'user.need_login', msg: '请先登录' },
  'GET /api/user/info': { err: 'need_login', msg: '未登录' },
  'GET /api/review/book': { err: 'ok', data: { id: 101 } },
  'GET /api/review/book/list': { err: 'ok', data: { list: [] } },
  'GET /api/review/summary': { err: 'ok', data: { list: [] } },
  'GET /api/review/list': { err: 'ok', data: { list: [] } },
}

// 一个示例已登录用户
const SAMPLE_USER = {
  id: 1,
  nickname: '测试书友',
  email: 'reader@example.com',
  avatar: 'mdi-account',
}

// 示例章评列表
const SAMPLE_COMMENTS = [
  { id: 11, content: '这一段写得真好', nickName: '路人甲', avatar: 'mdi-account', level: 1, createTime: '2026-06-01', geo: '北京', likeCount: 5 },
  { id: 12, content: '深有同感', nickName: '路人乙', avatar: 'mdi-account', level: 2, createTime: '2026-06-02', geo: '上海', likeCount: 2 },
]

/**
 * 安装后端 mock。
 * @param {import('@playwright/test').Page} page
 * @param {object} overrides 形如 { 'GET /api/user/info': {err:'ok', data:{...}} } 的覆盖项
 * @returns {{ calls: Array<{method:string,url:string}> }} 记录被调用的接口，便于断言
 */
async function setupApiMock(page, overrides = {}) {
  const responses = { ...GUEST_RESPONSES, ...overrides }
  const calls = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const key = `${method} ${url.pathname}`
    calls.push({ method, url: url.pathname + url.search })

    const body = responses[key]
    if (body === undefined) {
      // 未显式 mock 的接口，返回一个安全的空成功响应，避免真实网络请求
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ err: 'ok', data: {} }),
      })
      return
    }

    if (body.__body !== undefined) {
      await route.fulfill({
        status: body.__status || 200,
        contentType: body.__contentType || 'application/octet-stream',
        headers: body.__headers || {},
        body: body.__body,
      })
      return
    }

    await route.fulfill({
      status: body.__status || 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  return { calls }
}

module.exports = { setupApiMock, SAMPLE_USER, SAMPLE_COMMENTS, GUEST_RESPONSES }
