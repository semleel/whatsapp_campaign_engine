import { z } from "zod";

// --- Base fields shared by all message types ---
const baseMessageSchema = z.object({
  from: z.string(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
});

// --- Define message subtypes ---
const textMessageSchema = baseMessageSchema.merge(
  z.object({
    type: z.literal("text"),
    text: z.object({
      body: z.string(),
    }),
  })
);

const imageMessageSchema = baseMessageSchema.merge(
  z.object({
    type: z.literal("image"),
    image: z.object({
      caption: z.string().optional(),
      mime_type: z.string().optional(),
      sha256: z.string().optional(),
      id: z.string().optional(),
    }),
  })
);

const interactiveMessageSchema = baseMessageSchema.merge(
  z.object({
    type: z.literal("interactive"),
    interactive: z.object({
      type: z.enum(["button_reply", "list_reply"]),
      button_reply: z
        .object({
          id: z.string(),
          title: z.string(),
        })
        .optional(),
      list_reply: z
        .object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
        })
        .optional(),
    }),
  })
);

// --- Combine all types into a union ---
const messageSchema = z.union([
  textMessageSchema,
  imageMessageSchema,
  interactiveMessageSchema,
]);

// --- Main WhatsApp webhook structure ---
export const whatsappWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          value: z.object({
            messages: z.array(messageSchema).optional(),
          }),
        })
      ),
    })
  ),
});
