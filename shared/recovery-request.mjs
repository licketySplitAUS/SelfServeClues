// Each attempt gets a fresh timeout; credentials stay in headers.
export async function recoveryRequest(url, options, { timeout = 60000, attempts = 4, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
      if (response.ok) return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (attempt === attempts || !(error instanceof TypeError || ['TimeoutError', 'AbortError'].includes(error.name))) throw error;
    }
    if (response) {
      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === attempts) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Backup request failed (HTTP ${response.status}).`);
      }
      await response.body?.cancel();
    }
    await wait(1000 * 2 ** (attempt - 1));
  }
}
