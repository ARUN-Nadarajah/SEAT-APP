/**
 * Dev helper: prints every registered API route.
 * Usage: node scripts/list-routes.js
 */
const app = require("../src/app");

const lines = [];

function prefixOf(layer) {
  if (!layer.regexp || !layer.regexp.source) return "";
  return layer.regexp.source
    .replace("^\\/?(?=\\/|$)", "")
    .replace(/^\^/, "")
    .replace(/\\\/?$/, "")
    .replace(/\\\//g, "/");
}

function walk(stack, prefix = "") {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .map((m) => m.toUpperCase())
        .join(",");
      lines.push(`${methods.padEnd(6)} ${prefix}${layer.route.path}`);
    } else if (layer.name === "router" && layer.handle?.stack) {
      walk(layer.handle.stack, prefix + prefixOf(layer));
    }
  }
}

walk(app._router.stack);
console.log(lines.sort().join("\n"));
console.log(`\n${lines.length} routes`);
