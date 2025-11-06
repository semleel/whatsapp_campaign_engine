// src/validators/webhookValidator.js
import { z } from "zod";

// --- Base fields shared by all message types ---
const baseMessageSchema = z.object({
  from: z.string(),                 // end-user WhatsApp number (E.164)
  id: z.string().optional(),
  timestamp: z.string().optional(),
});

// --- Message subtypes (outer objects .passthrough() to keep unknown siblings like context/referral) ---
const textMessageSchema = baseMessageSchema
  .merge(z.object({
    type: z.literal("text"),
    text: z.object({ body: z.string() }).passthrough(), // allow future fields inside text
  }))
  .passthrough();

const imageMessageSchema = baseMessageSchema
  .merge(z.object({
    type: z.literal("image"),
    image: z.object({
      caption: z.string().optional(),
      mime_type: z.string().optional(),
      sha256: z.string().optional(),
      id: z.string().optional(),
      link: z.string().optional(), // sometimes present on inbound echoes/templates
    }).passthrough(),
  }))
  .passthrough();

const interactiveMessageSchema = baseMessageSchema
  .merge(z.object({
    type: z.literal("interactive"),
    interactive: z.object({
      type: z.enum(["button_reply", "list_reply"]),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().optional(),
      }).optional(),
    }).passthrough(),
  }))
  .passthrough();

// Add sticker to avoid 400s when users send stickers
const stickerMessageSchema = baseMessageSchema
  .merge(z.object({
    type: z.literal("sticker"),
    sticker: z.object({
      mime_type: z.string().optional(),
      sha256: z.string().optional(),
      id: z.string().optional(),
    }).passthrough(),
  }))
  .passthrough();

// --- Union of message types ---
const messageSchema = z.union([
  textMessageSchema,
  imageMessageSchema,
  interactiveMessageSchema,
  stickerMessageSchema,
]);

// --- Status receipts (be permissive, but typed enough to be useful) ---
const statusSchema = z.object({
  id: z.string().optional(),          // provider_msg_id
  status: z.string().optional(),      // sent|delivered|read|failed...
  timestamp: z.string().optional(),   // unix seconds
  recipient_id: z.string().optional(),
  errors: z.array(z.any()).optional(), // Meta sometimes includes an errors array
}).passthrough();

// --- WhatsApp 'value' object (allow extras) ---
const valueSchema = z.object({
  messages: z.array(messageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
  metadata: z.object({
    display_phone_number: z.string().optional(), // business number
    phone_number_id: z.string().optional(),      // business number ID
  }).passthrough().optional(),
}).passthrough();

// --- Main webhook payload (allow extras) ---
export const whatsappWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string().optional(),
    changes: z.array(z.object({
      field: z.string().optional(),
      value: valueSchema,
    }).passthrough()),
  }).passthrough()),
}).passthrough();
