/** Owns selector and embedded-mode events; selection returns through callbacks. */
export function createMetricsControls({ onScopeChange, onMonthChange }) {
  const scope = document.getElementById("example-scope");
  const month = document.getElementById("example-month");
  function setup() {
    scope.addEventListener("change", () => onScopeChange(Number(scope.value)));
    month.addEventListener("change", () => onMonthChange(Number(month.value)));
    if (new window.URLSearchParams(window.location.search).has("embed")) {
      document.body.classList.add("metrics-embedded");
      document.querySelector(".site-nav").remove();
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        window.parent.postMessage(
          { type: "metrics-close" },
          window.location.origin,
        );
      });
    }
  }
  return { setup };
}
