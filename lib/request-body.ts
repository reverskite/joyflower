// Discard small rejected bodies so the local HTTP proxy can reuse its connection.
// Never parse/log them. Bound both bytes and waiting time for untrusted clients.
export async function discardRequestBody(request: Request) {
  if (request.bodyUsed) return;
  const reader = request.body?.getReader();
  if (!reader) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 1000); });
    let bytes = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) { void reader.cancel().catch(() => {}); break; }
    }
  } catch { void reader.cancel().catch(() => {}); }
  finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
}
