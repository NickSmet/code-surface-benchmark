<script lang="ts">
  import '$lib/components/tour/tour.css';
  import TourStepper from '$lib/components/tour/TourStepper.svelte';

  let { children } = $props();
</script>

<div class="tour">
  <TourStepper />
  <main class="tour-main">
    {@render children()}
  </main>
</div>
