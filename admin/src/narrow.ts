import { computed, onMounted, onUnmounted, ref } from "vue";
import { NARROW_MAX_PX } from "./theme";

export function useNarrow(maxPx = NARROW_MAX_PX) {
  const isNarrow = ref(false);
  const mq = typeof window !== "undefined" ? window.matchMedia(`(max-width: ${maxPx}px)`) : null;

  function sync() {
    const byWidth = typeof window !== "undefined" && window.innerWidth <= maxPx;
    isNarrow.value = byWidth || !!mq?.matches;
  }

  onMounted(() => {
    sync();
    mq?.addEventListener("change", sync);
    window.addEventListener("resize", sync);
  });
  onUnmounted(() => {
    mq?.removeEventListener("change", sync);
    window.removeEventListener("resize", sync);
  });

  return { isNarrow: computed(() => isNarrow.value) };
}
