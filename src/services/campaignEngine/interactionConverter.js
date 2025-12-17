// src/services/campaignEngine/interactionConverter.js

const MAX_DEFAULT_ITEMS = 10;

const isObject = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);

const toStringSafe = (v) =>
    v === null || v === undefined ? "" : String(v).trim();

/**
 * Resolve nested path (a.b.c)
 */
function resolvePath(data, path) {
    if (!path) return data;
    return path
        .split(".")
        .map((p) => p.trim())
        .filter(Boolean)
        .reduce((acc, key) => (acc ? acc[key] : undefined), data);
}

/**
 * Convert API response into WhatsApp interaction payload
 *
 * Supports:
 * 1) Array           → flat rows
 * 2) Object<array>   → sections (WhatsApp list)
 */
export function convertApiResponseToInteraction({ response, config = {} }) {
    const {
        response_path = "",
        max_items = MAX_DEFAULT_ITEMS,
        type = "menu",
    } = config;

    const root = resolvePath(response, response_path);
    if (!root) return { rows: [], sections: [] };

    // ✅ CASE 1: ARRAY → flat list
    if (Array.isArray(root)) {
        const rows = root
            .map((item) => ({
                id: toStringSafe(item),
                title: toStringSafe(item),
            }))
            .slice(0, max_items);

        return type === "menu"
            ? { sections: [{ title: "Options", rows }] }
            : { rows };
    }

    // ✅ CASE 2: OBJECT OF ARRAYS → sectioned menu (FACILITIES)
    if (isObject(root)) {
        const sections = Object.entries(root)
            .map(([group, items]) => {
                if (!Array.isArray(items) || items.length === 0) return null;

                return {
                    title: group,
                    rows: items.map((item) => ({
                        id: `${group}|${item}`.toLowerCase().replace(/\s+/g, "_"),
                        title: toStringSafe(item),
                    })),
                };
            })
            .filter(Boolean)
            .slice(0, max_items);

        return { sections };
    }

    return { rows: [], sections: [] };
}
