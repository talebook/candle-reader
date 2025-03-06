<template>
  <EpubReader :book_url="book_url" :display_url="display_url"/>
</template>

<script>
export default {
  name: 'CandleReader',
  computed: {
  },
  mounted: function () {
  },
  props: ['book_url', 'display_url'],
  data: () => ({

  })
}
</script>
