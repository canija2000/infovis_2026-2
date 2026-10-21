export default [
  {
    files: ["web/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: Object.fromEntries(
        [
          "window",
          "document",
          "d3",
          "fetch",
          "console",
          "localStorage",
          "getComputedStyle",
          "innerWidth",
          "innerHeight",
          "addEventListener",
          "removeEventListener",
          "ResizeObserver",
          "IntersectionObserver",
          "Image",
          "Event",
          "CustomEvent",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "requestAnimationFrame",
          "cancelAnimationFrame",
        ].map((n) => [n, "readonly"]),
      ),
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
];
