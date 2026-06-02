# candle-reader UI Mock 测试

基于 **Playwright** 的端到端 UI 测试。后端 talebook 接口全部通过路由拦截（`page.route('**/api/**')`）mock，
测试**不依赖真实服务**，结果可复现、可离线运行。

## 运行

```bash
npm install            # 含 @playwright/test
npx playwright install chromium   # 首次需安装浏览器
npm run test:e2e       # 跑全部用例（自动拉起 vite dev server）
npm run test:e2e:ui    # 带 UI 调试面板
npx playwright test comments-login   # 只跑某个 spec
```

## 设计要点

- **测试入口**：`fixtures/reader-harness.html` —— 复刻生产 `index.html`，但把 `server` 指向同源、
  `book_url` 指向体积较小的 `/demo/book1.epub`，避免跨域与超时，使阅读器能真实渲染。
- **接口 mock**：`helpers/mock-api.js` —— `setupApiMock(page, overrides)`，默认“游客（未登录）”态，
  按需用 `overrides` 覆盖单个接口；未显式 mock 的接口返回安全空响应，杜绝真实网络请求。
- **稳定性**：底部导航与各面板是静态模板，不依赖 epub iframe，断言稳定。
  评论面板需经 iframe 内交互才会弹出（E2E 中极易 flaky），故通过 Vue 内部实例直接调用
  `EpubReader.set_menu('comments')` / `show_selected_comments(...)` 打开
  （`helpers/reader.js` 的 `openPanel` / `openCommentsPanel`），只测 UI 行为本身。
- **不覆盖 epub 正文渲染**：headless 环境下 epub.js 不渲染正文/不解析目录，这属于第三方
  渲染器行为而非本项目 UI 逻辑，刻意不纳入断言，以免引入环境相关的 flaky。切换主题/翻页
  只断言设置状态变化（`rendition` 对象在 mount 后即存在，相关调用不会抛错）。

## 测试用例清单（22 跑 + 2 跳过）

> 带 `@epub` 标签的用例会调用 `rendition.*`（epub.js），headless 下渲染不完整，
> 暂以 `test.skip` 跳过待讨论。恢复时去掉 `.skip` 即可。

### reader-ui.spec.js — 基础 UI / 导航
| 用例 | 验证点 |
| --- | --- |
| 页面加载后底部导航栏可见 | 目录/设置/用户/AI 四个入口渲染 |
| 点击「设置」打开设置面板 | 设置面板出现（亮度、翻页） |
| 点击「AI」打开开发中占位面板 | AI 面板显示“开发中” |
| 再次点击同一导航项可关闭面板 | `set_menu` 的 toggle 行为 |
| 设置面板可调整字号 | 点 A+ 后 `settings.font_size` +2 |
| 设置面板可切换翻页模式 `@epub`（跳过） | 点「上下滑动」后 `settings.flow==='scrolled'` |
| 点击主题按钮在白天/夜晚间切换 `@epub`（跳过） | `settings.theme_mode` 翻转 |

### auth.spec.js — 登录 / 注册 / 找回密码
| 用例 | mock | 验证点 |
| --- | --- | --- |
| 未登录展示登录表单 | 游客态 | 「用户」面板显示 Guest 登录卡片 |
| need_login 置 is_login=false | `/api/review/me` → need_login | 内部状态 `is_login===false` |
| 登录成功展示用户中心 | `sign_in` → ok | 出现“退出登录”，`user` 非空 |
| 登录失败展示错误 | `sign_in` → 失败 msg | 显示错误文案，不进入用户中心 |
| 忘记密码重置成功 | `reset` → ok | 显示“重置成功”提示 |
| 快速注册成功 | `sign_up` → ok | 显示“注册成功”提示 |
| 启动即已登录 | `user/info` → ok | 「用户」面板直接显示用户中心 |

### user-center.spec.js — 用户中心
| 用例 | mock | 验证点 |
| --- | --- | --- |
| 退出登录成功 | `sign_out` → ok | 确认后 `user` 置空，回到 Guest 登录表单 |
| 退出登录失败 | `sign_out` → exception | 提示错误且 `user` 仍非空 |
| 修改昵称成功 | `update` → ok | 保存后对话框关闭 |
| 修改昵称失败 | `update` → exception | 对话框保留并提示错误 |
| 未读消息红点 | `review/me` → count=3 | `unread_count===3`，徽标显示 3 |

### comments.spec.js — 章评列表 / 发表（已登录）
| 用例 | mock | 验证点 |
| --- | --- | --- |
| 展示输入框与发表按钮 | `review/me` → ok | 显示输入框与「发表」，无「点击登录」 |
| 评论列表渲染 | `review/list` → 列表 | 后端评论文案可见 |
| 发表评论成功追加 | `review/add` → ok | `comments` 长度 +1，新评论可见 |

### comments-login.spec.js — 章评登录入口（回归）
针对历史 bug：`BookComments` 直接给只读 prop `login` 赋值（`@click="login = !login"`），
触发 `Set operation on key "login" failed: target is readonly`，点击登录无反应。
修复为 `$emit('login')` + 父组件 `set_menu('more')`。

| 用例 | 验证点 |
| --- | --- |
| 未登录评论面板展示「点击登录」按钮 | 评论列表 + 登录按钮可见 |
| 点击「点击登录」切换到登录面板，且无 readonly 警告 | 跳转到登录面板**且**控制台无 readonly 警告（双重断言） |

> 该回归用例已验证：还原 bug 代码后用例会失败（登录面板不弹出），修复后通过。
