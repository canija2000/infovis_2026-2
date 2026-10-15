/** Enhances metric text, including later redraws, without changing controls. */
import { METRIC_TERMS } from "../../metrics/terms.js";
export function createMetricConceptLinks(rootElement) {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${METRIC_TERMS.map(([t]) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  const targets = new Map(METRIC_TERMS);
  function annotate(root) {
    const walker = document.createTreeWalker(
      root,
      window.NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          pattern.lastIndex = 0;
          return parent &&
            !parent.closest(
              'a, button, input, select, option, textarea, label, summary, svg, script, style, dialog, [contenteditable], [role=button], [role=tab], [data-metric-links="off"], #tooltip, .site-nav',
            ) &&
            pattern.test(node.data)
            ? window.NodeFilter.FILTER_ACCEPT
            : window.NodeFilter.FILTER_REJECT;
        },
      },
    );
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    for (const node of nodes) {
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (const match of node.data.matchAll(pattern)) {
        fragment.append(node.data.slice(offset, match.index));
        const link = document.createElement("a");
        link.className = "metric-link";
        link.dataset.metric = targets.get(match[0].toLocaleLowerCase("es"));
        link.href = `metricas.html#${link.dataset.metric}`;
        link.setAttribute("aria-haspopup", "dialog");
        link.title = `Ver definición de «${match[0]}»`;
        link.textContent = match[0];
        fragment.append(link);
        offset = match.index + match[0].length;
      }
      fragment.append(node.data.slice(offset));
      node.replaceWith(fragment);
    }
  }
  const observer = new window.MutationObserver((mutations) => {
    observer.disconnect();
    const roots = new Set(
      mutations.map((m) =>
        m.target.nodeType === 3 ? m.target.parentElement : m.target,
      ),
    );
    roots.forEach((root) => {
      if (root?.isConnected) annotate(root);
    });
    observer.observe(rootElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  annotate(rootElement);
  observer.observe(rootElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  return { disconnect: () => observer.disconnect() };
}
