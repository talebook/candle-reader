<template>
  <EpubReader
          :book_url="book_url" :display_url="display_url"
          :debug="debug" :themes_css="themes_css"
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
    }
  },
  data: () => ({
  })
}
</script>
