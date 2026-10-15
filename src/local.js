// Loads worlds/<name>/local.json: rivers and homesteads near the start.
// It is optional: a world without the file simply has none.
const files = import.meta.glob("../worlds/*/local.json", { eager: true });

export function loadLocal(id) {
  const file = files[`../worlds/${id}/local.json`];
  return file ? file.default : { rivers: [], homesteads: [] };
}