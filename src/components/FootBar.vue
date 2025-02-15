<template>
<v-bottom-navigation absolute :active="active">
  <v-btn value="recent">
    <v-icon>mdi-history</v-icon>

    <span>Recent</span>
  </v-btn>

  <v-btn value="favorites">
    <v-icon>mdi-heart</v-icon>

    <span>Favorites</span>
  </v-btn>

  <v-btn value="nearby">
    <v-icon>mdi-map-marker</v-icon>

    <span>Nearby</span>
  </v-btn>
</v-bottom-navigation>
</template>

<script>
export default {
  name: 'FootBar',
  computed: {
  },
  mounted: function () {
  },
  props: {
    active: false,
  },
  data: () => ({

  })
}

</script>

