// 后端接口 mock。用 Playwright route 拦截所有 /api/** 请求并返回受控 JSON，
// 使 UI 测试不依赖真实服务、结果可复现。

// 阅读器自身不请求评论或账号接口（这些都经 annotation_callbacks 交给宿主），
// 这里只需要为有声书等仍走 HTTP 的接口提供受控响应。

/**
 * 安装后端 mock。
 * @param {import('@playwright/test').Page} page
 * @param {object} overrides 形如 { 'GET /api/user/info': {err:'ok', data:{...}} } 的覆盖项
 * @returns {{ calls: Array<{method:string,url:string}> }} 记录被调用的接口，便于断言
 */
async function setupApiMock(page, overrides = {}) {
  const responses = { ...overrides }
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

module.exports = { setupApiMock }
