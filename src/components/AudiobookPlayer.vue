<template>
  <section
    v-if="visible"
    class="audiobook-player"
    data-testid="candle-audiobook-player"
    aria-label="边听边读播放器"
  >
    <header class="player-heading">
      <div>
        <span class="player-kicker">边听边读</span>
        <strong>{{ chapter?.title || '正在载入有声书' }}</strong>
      </div>
      <button type="button" class="icon-button" aria-label="关闭听书播放器" @click="emit('close')">
        <v-icon size="20">mdi-close</v-icon>
      </button>
    </header>

    <p class="active-dialogue" :class="{ muted: !activeSegment }">
      {{ activeSegment?.text || (loading ? '正在加载章节时间轴…' : '片段间留白') }}
    </p>

    <div v-if="error" class="player-error" role="alert">{{ error }}</div>

    <div class="player-controls">
      <button type="button" class="icon-button" aria-label="上一章" :disabled="chapterIndex <= 0" @click="previousChapter">
        <v-icon>mdi-skip-previous</v-icon>
      </button>
      <button
        type="button"
        class="play-button"
        :aria-label="playing ? '暂停听书' : '播放听书'"
        :disabled="loading || !chapter"
        @click="togglePlayback"
      >
        <v-icon>{{ playing ? 'mdi-pause' : 'mdi-play' }}</v-icon>
      </button>
      <button type="button" class="icon-button" aria-label="下一章" :disabled="chapterIndex >= chapters.length - 1" @click="nextChapter">
        <v-icon>mdi-skip-next</v-icon>
      </button>

      <span class="time">{{ formatTime(positionMs) }}</span>
      <input
        class="timeline-slider"
        type="range"
        min="0"
        :max="Math.max(durationMs, 1)"
        step="100"
        :value="positionMs"
        aria-label="听书进度"
        @input="seek(Number($event.target.value))"
      >
      <span class="time">{{ formatTime(durationMs) }}</span>

      <label class="rate-control">
        <span class="sr-only">播放速度</span>
        <select v-model.number="rate" aria-label="播放速度" @change="updateRate">
          <option v-for="value in rates" :key="value" :value="value">x{{ value }}</option>
        </select>
      </label>
    </div>

    <button
      v-if="!followNarration"
      type="button"
      class="return-button"
      data-testid="return-to-narration"
      @click="returnToNarration"
    >
      <v-icon size="18">mdi-target</v-icon>
      回到朗读位置
    </button>

    <audio
      ref="audioElement"
      preload="metadata"
      @loadedmetadata="onLoadedMetadata"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
      @error="onAudioError"
    ></audio>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  applyHighlight,
  chapterMatchesHref,
  clearHighlights,
  contentHref,
  findContent,
  findSegmentAt,
  normalizeText,
  segmentMatchesElement,
} from '@/audiobook/locator'

const props = defineProps({
  visible: { type: Boolean, default: false },
  editionId: { type: [Number, String], default: null },
  manifestUrl: { type: String, default: '' },
  rendition: { type: Object, default: null },
  request: { type: Function, required: true },
})

const emit = defineEmits(['close', 'segment-change'])
const audioElement = ref(null)
const manifest = ref(null)
const chapter = ref(null)
const timeline = ref([])
const activeSegment = ref(null)
const playing = ref(false)
const loading = ref(false)
const error = ref('')
const positionMs = ref(0)
const durationMs = ref(0)
const rate = ref(1)
const followNarration = ref(true)
const sessionId = ref('')
const progressVersion = ref(0)
const rates = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]
const highlightRetryIntervalMs = 50
const highlightSettleMs = 100
const highlightRetryAttempts = 40

let syncTimer = null
let progressTimer = null
let manifestPromise = null
let activeSegmentId = ''
let highlightSequence = 0
let lastProgressClock = 0

const chapters = computed(() => manifest.value?.chapters || [])
const chapterIndex = computed(() => chapters.value.findIndex(item => item.id === chapter.value?.id))
const storageKey = computed(() => `candle:audiobook:${props.editionId || 'manifest'}`)

watch(
  () => [props.visible, props.editionId, props.manifestUrl],
  ([visible]) => {
    if (visible) void loadManifest()
  },
  { immediate: true },
)

watch(
  () => props.rendition,
  (rendition, previousRendition) => {
    previousRendition?.off?.('rendered', onRenditionRendered)
    rendition?.on?.('rendered', onRenditionRendered)
  },
  { immediate: true },
)

function manifestEndpoint() {
  return props.manifestUrl || (props.editionId ? `/api/audiobooks/${props.editionId}/manifest` : '')
}

function loadManifest() {
  if (manifest.value || !manifestEndpoint()) return Promise.resolve()
  if (manifestPromise) return manifestPromise
  manifestPromise = loadManifestOnce().finally(() => {
    manifestPromise = null
  })
  return manifestPromise
}

async function loadManifestOnce() {
  loading.value = true
  error.value = ''
  try {
    const response = await props.request(manifestEndpoint())
    if (response.err !== 'ok' || !response.manifest?.chapters?.length) {
      throw new Error(response.msg || '当前书籍没有可播放章节')
    }
    manifest.value = response.manifest
    progressVersion.value = response.progress?.version || 0

    const saved = readSavedState()
    const target = chapters.value.find(item => item.id === response.progress?.chapter_id)
      || chapters.value.find(item => item.number === saved.chapterNumber)
      || chapters.value[0]
    const startMs = response.progress?.position_ms ?? saved.positionMs ?? 0
    rate.value = saved.rate || 1
    await loadChapter(target, { startMs, autoplay: false, navigate: false })
  } catch (cause) {
    error.value = cause?.message || '有声书加载失败'
  } finally {
    loading.value = false
  }
}

async function loadTimeline(target) {
  const endpoint = target.timeline_url || `/api/audiobooks/${manifest.value.id}/chapters/${target.number}/timeline`
  const response = await props.request(endpoint)
  timeline.value = response.err === 'ok' ? (response.timeline?.segments || []) : []
}

async function loadChapter(target, { startMs = 0, autoplay = false, navigate = true } = {}) {
  if (!target) return
  loading.value = true
  error.value = ''
  clearCurrentHighlight()
  try {
    chapter.value = target
    positionMs.value = Math.max(0, Number(startMs) || 0)
    durationMs.value = Number(target.duration_ms) || 0
    await loadTimeline(target)

    if (navigate && followNarration.value) await navigateToChapter(target)
    await nextTick()
    const audio = audioElement.value
    if (!audio) return
    const resolvedAudioUrl = new URL(target.audio_url, window.location.href).href
    if (audio.src !== resolvedAudioUrl) {
      audio.src = target.audio_url
      audio.load()
    }
    await waitForMetadata(audio)
    audio.playbackRate = rate.value
    audio.currentTime = Math.min(positionMs.value / 1000, audio.duration || Infinity)
    saveState()
    syncActiveSegment(true)
    if (autoplay) await startPlayback()
  } catch (cause) {
    error.value = cause?.message || '章节音频加载失败'
  } finally {
    loading.value = false
  }
}

async function navigateToChapter(target) {
  if (!props.rendition || !target?.source_key) return
  await props.rendition.display(target.source_key)
}

async function ensureSession() {
  if (sessionId.value || !manifest.value) return
  const response = await props.request(`/api/audiobooks/${manifest.value.id}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'candle', device_id: 'candle-reader' }),
  })
  if (response.err === 'ok') sessionId.value = response.session_id || ''
}

async function startPlayback() {
  const audio = audioElement.value
  if (!audio) return
  await ensureSession()
  audio.playbackRate = rate.value
  try {
    await audio.play()
  } catch (cause) {
    error.value = cause?.name === 'NotAllowedError' ? '请再次点击播放' : '无法播放章节音频'
  }
}

async function togglePlayback() {
  if (!manifest.value) await loadManifest()
  const audio = audioElement.value
  if (!audio || !chapter.value) return
  if (audio.paused) await startPlayback()
  else audio.pause()
}

function onLoadedMetadata() {
  const audio = audioElement.value
  if (!audio) return
  durationMs.value = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : durationMs.value
}

function waitForMetadata(audio) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('章节音频元数据加载失败'))
    }
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady)
      audio.removeEventListener('error', onError)
    }
    audio.addEventListener('loadedmetadata', onReady)
    audio.addEventListener('error', onError)
  })
}

function onPlay() {
  playing.value = true
  lastProgressClock = Date.now()
  syncActiveSegment(true)
  startTimers()
  updateMediaSession()
}

function onPause() {
  playing.value = false
  stopTimers()
  sampleAudioPosition()
  void reportProgress(true)
  saveState()
}

async function onEnded() {
  playing.value = false
  stopTimers()
  await reportProgress(true, chapterIndex.value === chapters.value.length - 1)
  if (chapterIndex.value < chapters.value.length - 1) {
    await loadChapter(chapters.value[chapterIndex.value + 1], { autoplay: true })
  }
}

function onAudioError() {
  if (!audioElement.value?.src) return
  error.value = '章节音频加载失败'
  playing.value = false
  stopTimers()
}

function startTimers() {
  stopTimers()
  syncTimer = window.setInterval(sampleAudioPosition, 150)
  progressTimer = window.setInterval(() => void reportProgress(), 10000)
}

function stopTimers() {
  if (syncTimer) window.clearInterval(syncTimer)
  if (progressTimer) window.clearInterval(progressTimer)
  syncTimer = null
  progressTimer = null
}

function sampleAudioPosition() {
  const audio = audioElement.value
  if (!audio) return
  positionMs.value = Math.round(audio.currentTime * 1000)
  syncActiveSegment()
  saveState()
}

function syncActiveSegment(force = false) {
  const segment = findSegmentAt(timeline.value, positionMs.value)
  const nextId = segment?.id || ''
  if (!force && nextId === activeSegmentId) return
  activeSegmentId = nextId
  activeSegment.value = segment
  emit('segment-change', segment)

  if (!segment || !followNarration.value || !playing.value) {
    clearCurrentHighlight()
    return
  }
  void highlightSegment(segment)
}

async function highlightSegment(segment) {
  const sequence = ++highlightSequence
  const locator = segment.locator || {}
  const href = locator.href || chapter.value?.source_key
  let contents = findContent(props.rendition, href)

  if (!contents && props.rendition && followNarration.value) {
    await props.rendition.display(href)
  }

  for (let attempt = 0; attempt < highlightRetryAttempts; attempt += 1) {
    if (sequence !== highlightSequence || !followNarration.value) return
    contents = findContent(props.rendition, href)
    if (contents && applyHighlight(props.rendition, contents, segment)) {
      await new Promise(resolve => window.setTimeout(resolve, highlightSettleMs))
      if (sequence !== highlightSequence || !followNarration.value) return

      const settledContents = findContent(props.rendition, href)
      const highlighted = settledContents?.document?.querySelector('[data-candle-audiobook-active]')
      if (highlighted?.getAttribute('data-candle-audiobook-active') === segment.id) return
    }

    await new Promise(resolve => window.setTimeout(resolve, highlightRetryIntervalMs))
  }

  if (sequence === highlightSequence && followNarration.value) {
    console.warn('[candle-audiobook] 无法定位时间轴片段', segment.id)
  }
}

function onRenditionRendered() {
  if (activeSegment.value && followNarration.value && playing.value) {
    void highlightSegment(activeSegment.value)
  }
}

function clearCurrentHighlight() {
  highlightSequence += 1
  clearHighlights(props.rendition)
}

function suspendFollow() {
  if (!chapter.value || !activeSegment.value) return
  followNarration.value = false
  clearCurrentHighlight()
}

async function returnToNarration() {
  followNarration.value = true
  if (activeSegment.value) await highlightSegment(activeSegment.value)
}

function seek(value) {
  const audio = audioElement.value
  positionMs.value = Math.max(0, Math.min(durationMs.value, value))
  if (audio) audio.currentTime = positionMs.value / 1000
  syncActiveSegment(true)
  saveState()
}

function updateRate() {
  if (audioElement.value) audioElement.value.playbackRate = rate.value
  saveState()
}

async function previousChapter() {
  if (chapterIndex.value > 0) await loadChapter(chapters.value[chapterIndex.value - 1], { autoplay: playing.value })
}

async function nextChapter() {
  if (chapterIndex.value < chapters.value.length - 1) await loadChapter(chapters.value[chapterIndex.value + 1], { autoplay: playing.value })
}

async function playFromSelection(selection) {
  if (!manifest.value) await loadManifest()
  if (!manifest.value || !selection) return false
  followNarration.value = true

  const selectionHref = selection.toc?.href || selection.toc?.id || contentHref(selection.contents)
  const targetChapter = chapters.value.find(item => chapterMatchesHref(item, selectionHref)) || chapter.value || chapters.value[0]
  if (targetChapter?.id !== chapter.value?.id) await loadChapter(targetChapter, { navigate: false })

  const cfi = selection.cfi?.toString?.() || selection.cfi
  const range = cfi && props.rendition?.getRange?.(cfi)
  const node = range?.startContainer?.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range?.startContainer
  const element = node?.closest?.('p, h1, h2, h3, h4, h5, h6, li, blockquote') || null
  const elementText = normalizeText(element?.textContent)
  const matched = (elementText && timeline.value.find(segment => normalizeText(segment.text) === elementText))
    || (element && timeline.value.find(segment => segmentMatchesElement(segment, element)))
    || timeline.value.find(segment => Number(segment.index) === Number(selection.segment_id))
  if (!matched) return false

  await loadChapter(targetChapter, { startMs: matched.start_ms, autoplay: true, navigate: true })
  return true
}

async function reportProgress(force = false, completed = false) {
  if (!sessionId.value || !chapter.value) return
  const now = Date.now()
  const delta = playing.value && lastProgressClock ? Math.min(60000, Math.max(0, now - lastProgressClock)) : 0
  if (!force && delta < 9000) return
  lastProgressClock = now
  const response = await props.request(`/api/audiobook-sessions/${sessionId.value}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chapter_id: chapter.value.id,
      position_ms: positionMs.value,
      segment_id: activeSegment.value?.id || '',
      listened_delta_ms: delta,
      completed,
      version: progressVersion.value,
    }),
  })
  if (response.err === 'ok') progressVersion.value = response.version || progressVersion.value
  else if (response.err === 'progress.conflict') progressVersion.value = response.version || progressVersion.value
}

function readSavedState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey.value) || '{}')
  } catch {
    return {}
  }
}

function saveState() {
  if (!chapter.value) return
  localStorage.setItem(storageKey.value, JSON.stringify({
    chapterNumber: chapter.value.number,
    positionMs: positionMs.value,
    rate: rate.value,
  }))
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !chapter.value) return
  navigator.mediaSession.metadata = new MediaMetadata({ title: chapter.value.title, album: '边听边读' })
  navigator.mediaSession.setActionHandler('play', startPlayback)
  navigator.mediaSession.setActionHandler('pause', () => audioElement.value?.pause())
  navigator.mediaSession.setActionHandler('previoustrack', previousChapter)
  navigator.mediaSession.setActionHandler('nexttrack', nextChapter)
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor((value || 0) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

onBeforeUnmount(() => {
  stopTimers()
  props.rendition?.off?.('rendered', onRenditionRendered)
  clearCurrentHighlight()
  if (sessionId.value) void props.request(`/api/audiobook-sessions/${sessionId.value}`, { method: 'POST' })
})

defineExpose({ loadManifest, playFromSelection, returnToNarration, suspendFollow })
</script>

<style scoped>
.audiobook-player {
  position: fixed;
  right: 12px;
  bottom: calc(64px + env(safe-area-inset-bottom));
  left: 12px;
  z-index: 2500;
  padding: 12px 14px;
  color: #f9f6ef;
  background: linear-gradient(135deg, rgba(24, 33, 45, .97), rgba(62, 46, 31, .97));
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 18px;
  box-shadow: 0 14px 45px rgba(0, 0, 0, .34);
  backdrop-filter: blur(18px);
}
.player-heading, .player-controls { display: flex; align-items: center; gap: 9px; }
.player-heading { justify-content: space-between; }
.player-heading > div { min-width: 0; display: grid; }
.player-heading strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.player-kicker { color: #f3bd62; font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.active-dialogue { min-height: 22px; margin: 8px 0; overflow: hidden; color: #fff; font-family: Georgia, 'Noto Serif SC', serif; font-size: 13px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.active-dialogue.muted { color: rgba(255, 255, 255, .55); }
.icon-button, .play-button, .return-button { border: 0; color: inherit; cursor: pointer; }
.icon-button { display: grid; flex: 0 0 34px; width: 34px; height: 34px; place-items: center; background: transparent; border-radius: 50%; }
.icon-button:hover { background: rgba(255, 255, 255, .1); }
.icon-button:disabled { opacity: .28; cursor: default; }
.play-button { display: grid; flex: 0 0 40px; width: 40px; height: 40px; place-items: center; color: #2c2116; background: #f3bd62; border-radius: 50%; }
.timeline-slider { min-width: 54px; flex: 1; accent-color: #f3bd62; }
.time { color: rgba(255, 255, 255, .7); font-size: 10px; font-variant-numeric: tabular-nums; }
.rate-control select { padding: 5px 4px; color: inherit; background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .16); border-radius: 7px; }
.return-button { display: flex; margin: 9px auto 0; padding: 6px 10px; align-items: center; gap: 5px; color: #2c2116; background: #f3bd62; border-radius: 99px; font-size: 12px; font-weight: 700; }
.player-error { margin: 6px 0; color: #ffb4ab; font-size: 12px; text-align: center; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (min-width: 700px) {
  .audiobook-player { right: 24px; bottom: 24px; left: auto; width: min(620px, calc(100vw - 48px)); }
}
</style>
