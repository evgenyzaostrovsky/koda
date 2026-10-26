/** Bound network waits without converting failures into successful API responses. */
export function createSupabaseFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init?.signal?.aborted) controller.abort();
    init?.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 8000);
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      init?.signal?.removeEventListener('abort', abort);
    }
  };
}
