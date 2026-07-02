<script lang="ts">
  import '../app.css';
  import { dev } from '$app/environment';
  let { children } = $props();
</script>

{@render children()}

{#if dev}
  <!-- Dev-only inspector; dynamic import keeps it out of production bundles. -->
  {#await import('svelte-grab') then { SvelteDevKit }}
    <SvelteDevKit />
  {/await}
{/if}
