// src/services/apiEndpointRuntime.js

import prisma from "../config/prismaClient.js";

function buildBaseUrl(row) {
  const base = (row.base_url || "").replace(/\/+$/, "");
  const path = (row.path || "").replace(/^\/+/, "");
  if (!path) return base;
  return `${base}/${path}`;
}

function mapParameters(paramRows = []) {
  const headers = [];
  const query = [];

  for (const p of paramRows) {
    if (!p.key) continue;

    const source = (p.value_source || "constant").toLowerCase();
    let value = "";

    if (source === "constant") {
      // Literal value straight from the DB
      value = (p.constant_value || "").trim();
    } else if (p.value_path) {
      // Build a template like {{contact.latitude}} or {{campaign.code}}
      const path = p.value_path.trim();
      if (path) {
        value = `{{${source}.${path}}}`;
      }
    }

    if (!value) continue;

    if (p.location === "header") {
      headers.push({ key: p.key, value });
    } else if (p.location === "query") {
      query.push({ key: p.key, value });
    }
  }

  return { headers, query };
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

  const paramRows = await prisma.api_parameter.findMany({
    where: { api_id: id },
    orderBy: { param_id: "asc" },
  });

  const { headers, query } = mapParameters(paramRows);
  const authType = apiRow.auth_type || "none";

  return {
    id: apiRow.api_id,
    name: apiRow.name,
    method: (apiRow.method || "GET").toUpperCase(),
    url: buildBaseUrl(apiRow),
    description: apiRow.description || "",
    headers,
    query,
    bodyTemplate: "",
    auth: {
      type: authType,
      headerName: apiRow.auth_header_name || undefined,
      tokenRef: apiRow.auth_token || undefined,
    },
    timeoutMs: apiRow.timeout_ms ?? 8000,
    retries: apiRow.retry_enabled ? apiRow.retry_count ?? 0 : 0,
    backoffMs: 0,
  };
}
