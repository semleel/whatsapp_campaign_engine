import crypto from "crypto";
import { supabase } from "./supabaseService.js";

const responseTemplateStore = new Map();
const mappingStore = new Map();
const logStore = [];

let templateSeq = 1;

const DEFAULT_LOG_LIMIT = 500;

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
}

export function seedIntegrationData() {
  if (responseTemplateStore.size) return;

  const sampleTemplate = {
    id: templateSeq++,
    name: "Points balance (EN)",
    locale: "en",
    body: "Hi {{mobile}}, you have {{args.points|number}} points remaining.",
    variables: ["mobile", "points"],
  };

  responseTemplateStore.set(sampleTemplate.id, sampleTemplate);
}

function parseExtras(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function serializeExtras(data) {
  return JSON.stringify({
    description: data.description || "",
    headers: data.headers || [],
    query: data.query || [],
    bodyTemplate: data.bodyTemplate || "",
    auth: data.auth || { type: "none" },
    timeoutMs: Number.isFinite(data.timeoutMs) ? Number(data.timeoutMs) : 8000,
    retries: Number.isFinite(data.retries) ? Number(data.retries) : 0,
    backoffMs: Number.isFinite(data.backoffMs) ? Number(data.backoffMs) : 300,
  });
}

function mapParameter(row) {
  return {
    id: row.paramid,
    key: row.key,
    valueSource: row.valuesource || "query",
    value: row.value,
    required: !!row.required,
  };
}

function hydrateEndpoint(row, params = []) {
  const extras = parseExtras(row.response);
  return {
    id: row.apiid,
    contentId: row.contentid ?? null,
    name: row.name,
    method: row.method?.toUpperCase() === "POST" ? "POST" : "GET",
    url: row.url,
    description: extras.description || "",
    headers: extras.headers || [],
    query: extras.query || [],
    bodyTemplate: extras.bodyTemplate || "",
    auth: extras.auth || { type: "none" },
    timeoutMs: extras.timeoutMs ?? 8000,
    retries: extras.retries ?? 0,
    backoffMs: extras.backoffMs ?? 300,
    parameters: params.map(mapParameter),
  };
}

async function fetchParametersForIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("apiparameter").select("*").in("apiid", ids);
  if (error) {
    throw new Error(error.message || "Failed to load API parameters");
  }
  return data || [];
}

async function fetchParameters(apiId) {
  const rows = await fetchParametersForIds([apiId]);
  return rows.filter((row) => row.apiid === apiId);
}

async function syncParameters(apiId, parameters = []) {
  await supabase.from("apiparameter").delete().eq("apiid", apiId);
  if (!parameters.length) return;
  const insertRows = parameters
    .filter((param) => param.key && param.value)
    .map((param) => ({
      apiid: apiId,
      key: param.key,
      valuesource: param.valueSource || "query",
      value: param.value,
      required: !!param.required,
    }));
  if (insertRows.length) {
    const { error } = await supabase.from("apiparameter").insert(insertRows);
    if (error) {
      throw new Error(error.message || "Failed to save API parameters");
    }
  }
}

export async function listEndpoints() {
  const { data, error } = await supabase.from("api").select("*").order("apiid");
  if (error) {
    throw new Error(error.message || "Failed to load endpoints");
  }
  const rows = data || [];
  if (!rows.length) return [];
  const paramRows = await fetchParametersForIds(rows.map((row) => row.apiid));
  const grouped = paramRows.reduce((acc, row) => {
    const list = acc.get(row.apiid) || [];
    list.push(row);
    acc.set(row.apiid, list);
    return acc;
  }, new Map());
  return rows.map((row) => hydrateEndpoint(row, grouped.get(row.apiid) || []));
}

export async function getEndpoint(id) {
  if (!id) return null;
  const { data, error } = await supabase.from("api").select("*").eq("apiid", Number(id)).maybeSingle();
  if (error) {
    throw new Error(error.message || "Failed to load endpoint");
  }
  if (!data) return null;
  const params = await fetchParameters(data.apiid);
  return hydrateEndpoint(data, params);
}

export async function saveEndpoint(data) {
  const record = {
    contentid: data.contentId ?? null,
    name: data.name,
    url: data.url,
    method: (data.method ?? "GET").toUpperCase(),
    response: serializeExtras(data),
    lastupdated: new Date().toISOString(),
  };
  let row;
  if (data.id) {
    const { data: updated, error } = await supabase
      .from("api")
      .update(record)
      .eq("apiid", Number(data.id))
      .select()
      .single();
    if (error) {
      throw new Error(error.message || "Failed to update endpoint");
    }
    row = updated;
  } else {
    const { data: inserted, error } = await supabase
      .from("api")
      .insert(record)
      .select()
      .single();
    if (error) {
      throw new Error(error.message || "Failed to create endpoint");
    }
    row = inserted;
  }
  await syncParameters(row.apiid, data.parameters || []);
  const params = await fetchParameters(row.apiid);
  return hydrateEndpoint(row, params);
}

export async function deleteEndpoint(id) {
  if (!id) return false;
  await supabase.from("apiparameter").delete().eq("apiid", Number(id));
  const { data, error } = await supabase.from("api").delete().eq("apiid", Number(id)).select("apiid");
  if (error) {
    throw new Error(error.message || "Failed to delete endpoint");
  }
  return (data?.length || 0) > 0;
}

export function listResponseTemplates() {
  return Array.from(responseTemplateStore.values());
}

export function getResponseTemplate(id) {
  return responseTemplateStore.get(Number(id));
}

export function saveResponseTemplate(data) {
  const id = data.id ? Number(data.id) : templateSeq++;
  const payload = { ...data, id };
  responseTemplateStore.set(id, payload);
  return payload;
}

export function deleteResponseTemplate(id) {
  return responseTemplateStore.delete(Number(id));
}

export function listMappings() {
  return Array.from(mappingStore.values());
}

export function getMapping(id) {
  return mappingStore.get(String(id));
}

export function saveMapping(data) {
  const id = data.id ? String(data.id) : generateId("map");
  const payload = { ...data, id };
  mappingStore.set(id, payload);
  return payload;
}

export function deleteMapping(id) {
  return mappingStore.delete(String(id));
}

export function appendLog(entry) {
  logStore.unshift(entry);
  if (logStore.length > DEFAULT_LOG_LIMIT) {
    logStore.length = DEFAULT_LOG_LIMIT;
  }
}

export function listLogs(limit = 100) {
  return logStore.slice(0, limit);
}
