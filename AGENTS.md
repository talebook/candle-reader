# AGENTS.md

面向 AI agent 的项目约定。与 `CLAUDE.md`（通用编码行为准则）配合使用。

## 提交 PR 前必须跑 e2e 测试

**任何改动在提交 / 推送 PR 之前，必须本地跑通 Playwright e2e 测试。** CI 会跑同一套用例，本地先验证可避免红 CI 来回。

```bash
npm run test:e2e
```

要点：
- 默认 dev server 端口为 `5001`。若本机已有其它 candle-reader 副本占用 5001，Playwright（`reuseExistingServer`）会误连到那个服务。此时用本仓库自己的端口并指过去：

  ```bash
  npx vite --port 5009 --strictPort &          # 启动本仓库的 dev server
  E2E_PORT=5009 npm run test:e2e               # 让 Playwright 复用它
  ```

- 全量套件应全部通过（当前 33 passed）。失败用例的现场快照在 `test-results/<用例名>/error-context.md`。
- 改了底部导航 / 登录 / 评论面板等 UI 时，重点核对 `tests/e2e/{auth,user-center,reader-ui,comments-login}.spec.js`：这些用例按文案（如「评论」「点击登录，发表评论」）定位元素，改文案会连带改测试。
