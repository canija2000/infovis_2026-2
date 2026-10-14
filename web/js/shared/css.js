export const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
