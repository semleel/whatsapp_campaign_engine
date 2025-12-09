// src/services/apiEndpointRuntime.js

import prisma from "../config/prismaClient.js";

function normalizeBodyTemplate(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function getRuntimeEndpoint(endpointId) {
  const id = Number(endpointId);
  if (!id || Number.isNaN(id)) {
    throw new Error("Invalid endpoint id");
  }

  const apiRow = await prisma.api.findUnique({
    where: { api_id: id },
  });

  if (!apiRow) {
    throw new Error("Endpoint not found");
  }

  const headers = Array.isArray(apiRow.headers_json)
    ? apiRow.headers_json
        .map((row) => ({
          key: row?.key,
          value: row?.value ?? "",
        }))
        .filter((row) => row.key)
    : [];

  return {
    id: apiRow.api_id,
    name: apiRow.name,
    method: (apiRow.method || "GET").toUpperCase(),
    url: apiRow.url,
    description: apiRow.description || "",
    headers,
    query: [],
    bodyTemplate: normalizeBodyTemplate(apiRow.body_template),
    response_template: apiRow.response_template || "",
    auth: {
      type: apiRow.auth_type || "none",
      headerName: apiRow.auth_header_name || undefined,
      tokenRef: apiRow.auth_token || undefined,
    },
    timeoutMs: 8000,
    retries: 0,
    backoffMs: 0,
  };
}
