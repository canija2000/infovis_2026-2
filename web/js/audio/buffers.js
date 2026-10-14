/** Decode clips once per owning AudioContext, preserving in-flight deduplication. */
export function createBufferCache({ getContext }) {
  const buffers = new Map();
  function load(urls) {
    const context = getContext();
    if (!context) return Promise.resolve();
    return Promise.all(
      urls
        .filter((url) => url && !buffers.has(url))
        .map(async (url) => {
          buffers.set(url, null);
          try {
            const data = await fetch(url).then((response) =>
              response.arrayBuffer(),
            );
            buffers.set(url, await context.decodeAudioData(data));
          } catch (error) {
            buffers.delete(url);
            console.warn("No se pudo cargar", url, error);
          }
        }),
    );
  }
  return { buffers, load };
}
