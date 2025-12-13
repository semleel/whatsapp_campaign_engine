// src/services/campaignEngine/apiErrorHelper.js

const TYPE_SERVICE_DOWN = "SERVICE_DOWN";
const TYPE_CLIENT = "CLIENT_INPUT";
const TYPE_DISABLED = "DISABLED";
const TYPE_TEMPLATE = "TEMPLATE_ERROR";
const TYPE_UNKNOWN = "UNKNOWN";

const DEFAULT_MESSAGES = {
  [TYPE_DISABLED]: "This service is temporarily unavailable. Please try again later.",
  [TYPE_TEMPLATE]: "This service is temporarily unavailable. Please try again later.",
  [TYPE_SERVICE_DOWN]: "This service is currently unavailable. Please try again later.",
  [TYPE_CLIENT]: "I couldn't find what you're looking for. Please check and try again.",
  [TYPE_UNKNOWN]: "Sorry, something went wrong. Please try again.",
};

function classifyError({ err, status }) {
  if (err?.code === "API_DISABLED") return TYPE_DISABLED;
  if (err?.code === "TEMPLATE_EMPTY") return TYPE_TEMPLATE;
  if (err?.code === "TEMPLATE_MISSING_FIELD") return TYPE_TEMPLATE;
  if (typeof status === "number") {
    if (status >= 500) return TYPE_SERVICE_DOWN;
    if (status >= 400) return TYPE_CLIENT;
  }
  return TYPE_UNKNOWN;
}

export function normalizeApiError({ err, status, api = {}, step = {} }) {
  const type = classifyError({ err, status });
  const defaultUserMessage = DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES[TYPE_UNKNOWN];
  const stepOverride =
    type === TYPE_CLIENT && step?.error_message?.trim()
      ? step.error_message.trim()
      : null;
  const userMessage = stepOverride || defaultUserMessage;
  const apiName = api?.name || `API ${api?.apiId ?? ""}`.trim() || "API";
  const systemMessage = err?.message
    ? `${apiName}: ${err.message}`
    : `${apiName}: ${defaultUserMessage}`;
  const logLevel =
    type === TYPE_SERVICE_DOWN || type === TYPE_UNKNOWN ? "error" : "warn";

  return {
    type,
    userMessage,
    logLevel,
    systemMessage,
  };
}
