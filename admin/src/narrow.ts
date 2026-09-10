import { computed, onMounted, onUnmounted, ref } from "vue";
import { NARROW_MAX_PX } from "./theme";

export function useNarrow(maxPx = NARROW_MAX_PX) {
  const isNarrow = ref(false);
  const mq = typeof window !== "undefined" ? window.matchMedia(`(max-width: ${maxPx}px)`) : null;

  function sync() {
    isNarrow.value = !!mq?.matches;
  }

  onMounted(() => {
    sync();
    mq?.addEventListener("change", sync);
  });
  onUnmounted(() => {
    mq?.removeEventListener("change", sync);
  });

  return { isNarrow: computed(() => isNarrow.value) };
}
