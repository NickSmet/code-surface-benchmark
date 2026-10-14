<script lang="ts">
  import { CACHE_TIP, NEW_TIP, OUTPUT_TIP } from '$lib/tour/explain';
  import { RUN_COLOR } from '$lib/tour/run-colors';
  import Tip from './Tip.svelte';
</script>

<span class="legend">
  <Tip class="lg" text={CACHE_TIP}><i class="sw hatch" style:background-color={RUN_COLOR.cached}></i>Cached input</Tip>
  <Tip class="lg" text={NEW_TIP}><i class="sw" style:background-color={RUN_COLOR.fresh}></i>New input</Tip>
  <Tip class="lg" text={OUTPUT_TIP}><i class="sw" style:background-color={RUN_COLOR.output}></i>Output</Tip>
</span>

<style>
  .legend {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 12px;
  }
  .legend :global(.lg) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .sw.hatch {
    background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0 2px, transparent 2px 6px);
  }
</style>
