const { test, expect } = require('@playwright/test')
const { setupApiMock } = require('./helpers/mock-api')
const { HARNESS_URL, waitForReaderRendered } = require('./helpers/reader')

function silentWav(durationSeconds = 12, sampleRate = 8000) {
  const sampleCount = durationSeconds * sampleRate
  const dataLength = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  return buffer
}

const manifest = {
  id: 7,
  book_id: 101,
  chapters: [{
    id: 71,
    number: 1,
    title: '第一章 绯红',
    source_key: 'index_split_002.html#filepos138679',
    duration_ms: 12000,
    audio_url: '/api/audiobooks/7/chapters/1/audio',
    timeline_url: '/api/audiobooks/7/chapters/1/timeline',
  }],
}

const timeline = {
  format: 'voicebook-timeline',
  version: 1,
  chapter_number: 1,
  duration_ms: 12000,
  segments: [
    {
      id: 'seg-1',
      index: 0,
      start_ms: 0,
      end_ms: 9000,
      text: '好痛！',
      locator: {
        type: 'epub-dom-text',
        href: 'index_split_002.html',
        dom_path: 'body/p[3]',
        start_char: 0,
        end_char: 3,
      },
    },
    {
      id: 'seg-2',
      index: 1,
      start_ms: 9200,
      end_ms: 11600,
      text: '头好痛！',
      locator: {
        type: 'epub-dom-text',
        href: 'index_split_002.html',
        dom_path: 'body/p[4]',
        start_char: 0,
        end_char: 4,
      },
    },
  ],
}

async function setupAudiobook(page) {
  return setupApiMock(page, {
    'GET /api/audiobooks/7/manifest': { err: 'ok', manifest, progress: null },
    'GET /api/audiobooks/7/chapters/1/timeline': { err: 'ok', timeline },
    'GET /api/audiobooks/7/chapters/1/audio': {
      __contentType: 'audio/wav',
      __headers: { 'Accept-Ranges': 'bytes' },
      __body: silentWav(),
    },
    'POST /api/audiobooks/7/sessions': { err: 'ok', session_id: 'candle-e2e' },
    'PATCH /api/audiobook-sessions/candle-e2e': { err: 'ok', version: 1 },
    'POST /api/audiobook-sessions/candle-e2e': { err: 'ok' },
  })
}

async function gotoAudiobookReader(page) {
  await page.goto(`${HARNESS_URL}?audiobook=1`)
  await page.getByRole('button', { name: '听书', exact: true }).waitFor({ state: 'visible' })
  await waitForReaderRendered(page)
}

async function activeHighlight(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('#reader iframe')).map((frame) => {
      const element = frame.contentDocument?.querySelector('[data-candle-audiobook-active]')
      return element ? {
        id: element.getAttribute('data-candle-audiobook-active'),
        text: element.textContent,
      } : null
    }).find(Boolean) || null
  })
}

async function expectActiveHighlight(page, expected) {
  await expect.poll(() => activeHighlight(page), { timeout: 15000 }).toMatchObject(expected)
}

test.beforeEach(async ({ page }) => {
  await setupAudiobook(page)
})

test('播放时间轴会自动翻到对应正文并按句段高亮', async ({ page }) => {
  await gotoAudiobookReader(page)
  await page.getByRole('button', { name: '听书', exact: true }).click()

  const player = page.getByTestId('candle-audiobook-player')
  await expect(player).toContainText('第一章 绯红')
  await page.getByRole('button', { name: '播放听书' }).click()

  await expect(player).toContainText('好痛！')
  await expectActiveHighlight(page, { id: 'seg-1', text: '好痛！' })
})

test('章节视图延迟注册时仍会重试高亮', async ({ page }) => {
  await gotoAudiobookReader(page)
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const reader = app._instance.subTree.component.proxy
    const display = reader.rendition.display.bind(reader.rendition)
    reader.rendition.display = (...args) => {
      window.setTimeout(() => void display(...args), 350)
      return Promise.resolve()
    }
  })

  await page.getByRole('button', { name: '听书', exact: true }).click()
  await page.getByRole('button', { name: '播放听书' }).click()

  await expect(page.getByTestId('candle-audiobook-player')).toContainText('好痛！')
  await expectActiveHighlight(page, { id: 'seg-1', text: '好痛！' })
})

test('手动翻页暂停自动跟随，并可返回当前朗读句段', async ({ page }) => {
  await gotoAudiobookReader(page)
  await page.getByRole('button', { name: '听书', exact: true }).click()
  await expect(page.getByTestId('candle-audiobook-player')).toContainText('好痛！', { timeout: 15000 })

  await page.keyboard.press('ArrowRight')
  const returnButton = page.getByTestId('return-to-narration')
  await expect(returnButton).toBeVisible()
  await expect.poll(() => activeHighlight(page)).toBeNull()

  await returnButton.click()
  await expect(returnButton).toBeHidden()
  await expectActiveHighlight(page, { id: 'seg-1' })
})

test('选中正文后可从对应时间轴片段开始听', async ({ page }) => {
  await gotoAudiobookReader(page)

  await page.evaluate(async () => {
    const app = document.querySelector('#app').__vue_app__
    const reader = app._instance.subTree.component.proxy
    await reader.rendition.display('index_split_002.html#filepos138679')
    let contents = null
    reader.rendition.views().forEach((view) => {
      if (view.section?.href?.includes('index_split_002')) contents = view.contents
    })
    const element = contents.document.querySelector('body > p:nth-of-type(4)')
    const cfi = new window.ePub.CFI(element, contents.cfiBase)
    reader.selected_location = {
      toc: { href: 'index_split_002.html', label: '第一章 绯红' },
      cfi,
      contents,
      segment_id: 1,
    }
    reader.toolbar_left = 20
    reader.toolbar_top = 120
  })

  await page.getByRole('button', { name: '从这里听' }).click()
  const player = page.getByTestId('candle-audiobook-player')
  await expect(player).toBeVisible()
  await expect(player).toContainText('头好痛！', { timeout: 5000 })
  await expectActiveHighlight(page, { id: 'seg-2', text: '头好痛！' })
})
