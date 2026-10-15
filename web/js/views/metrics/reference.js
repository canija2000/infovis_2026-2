/** Opens and scrolls to the requested definition, including nested details. */
export function createMetricsReference() {
  function revealConcept() {
    const id = window.location.hash.slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    for (let el = target; el; el = el.parentElement) {
      if (el.tagName === "DETAILS") el.open = true;
    }
    requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }
  window.addEventListener("hashchange", revealConcept);
  // Reopen a definition even if its unchanged hash was previously collapsed.
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link && link.hash === window.location.hash) revealConcept();
  });
  return { revealConcept };
}
