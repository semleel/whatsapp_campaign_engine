import { z } from "zod";

// --- Base fields shared by all message types ---
const baseMessageSchema = z.object({
  from: z.string(),                 // end-user WhatsApp number (E.164)
  id: z.string().optional(),
  timestamp: z.string().optional(),
});

// --- Message subtypes ---
const textMessageSchema = baseMessageSchema.merge(z.object({
  type: z.literal("text"),
  text: z.object({ body: z.string() }),
}));

const imageMessageSchema = baseMessageSchema.merge(z.object({
  type: z.literal("image"),
  image: z.object({
    caption: z.string().optional(),
    mime_type: z.string().optional(),
    sha256: z.string().optional(),
    id: z.string().optional(),
  }).passthrough(),
}));

const interactiveMessageSchema = baseMessageSchema.merge(z.object({
  type: z.literal("interactive"),
  interactive: z.object({
    type: z.enum(["button_reply", "list_reply"]),
    button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
  }),
}));

// --- Union of message types ---
const messageSchema = z.union([textMessageSchema, imageMessageSchema, interactiveMessageSchema]);

// --- WhatsApp 'value' object (allow extras) ---
const valueSchema = z.object({
  messages: z.array(messageSchema).optional(),
  statuses: z.array(z.any()).optional(), // delivery/read receipts etc.
  metadata: z.object({
    display_phone_number: z.string().optional(), // your business number
    phone_number_id: z.string().optional(),      // your business number ID
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
