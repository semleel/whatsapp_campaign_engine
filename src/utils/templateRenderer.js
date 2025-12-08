/**
 * Very small mustache-like renderer.
 * Renders {{a.b.c}} using a nested object.
 */
export function renderTemplate(template, payload) {
  if (!template || typeof template !== "string") return "";
  if (!payload || typeof payload !== "object") return template;

  return template.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
    const path = String(token).trim().split(".");
    let value = payload;
    for (const key of path) {
      if (value == null) break;
      value = value[key];
    }
    return value == null ? `{${token}}` : String(value);
  });
}

