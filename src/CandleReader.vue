<template>
  <EpubReader
          :book_url="book_url" :display_url="display_url"
          :debug="debug" :themes_css="themes_css"
          :initial_book_id="book_id"
          :annotation_callbacks="annotation_callbacks"
          :audiobook_edition_id="audiobook_edition_id"
          :audiobook_manifest_url="audiobook_manifest_url"
          />
</template>

<script>
export default {
  name: 'CandleReader',
  computed: {
  },
  mounted: function () {
  },
  props: {
    book_url: {
      type: String,
      required: true
    },
    display_url: {
      type: String,
      required: true
    },
    debug: {
      type: Boolean,
      default: false
    },
    themes_css: {
      type: String,
      default: "theme.css"
    },
    book_id: {
      type: [Number, String],
      default: null
    },
    annotation_callbacks: {
      type: Object,
      default: null
    },
    audiobook_edition_id: {
      type: [Number, String],
      default: null
    },
    audiobook_manifest_url: {
      type: String,
      default: ''
    }
  },
  data: () => ({
  })
}
</script>
