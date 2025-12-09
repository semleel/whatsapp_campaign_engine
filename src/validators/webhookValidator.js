// src/validators/webhookValidator.js
import { z } from "zod";

// Message schema (permissive) with explicit support for location
const messageSchema = z
  .object({
    from: z.string().optional(),
    id: z.string().optional(),
    timestamp: z.string().optional(),
    type: z.enum(["text", "image", "interactive", "sticker", "location"]),
    text: z.object({ body: z.string() }).optional(),
    interactive: z.any().optional(),
    image: z.any().optional(),
    sticker: z.any().optional(),
    location: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        name: z.string().optional(),
        address: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

const statusSchema = z
  .object({
    id: z.string().optional(),
    status: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .passthrough();

export const whatsappWebhookSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z.array(
          z.object({
            field: z.string().optional(),
            value: z
              .object({
                messaging_product: z.string().optional(),
                metadata: z
                  .object({
                    display_phone_number: z.string().optional(),
                    phone_number_id: z.string().optional(),
                  })
                  .optional(),
                contacts: z
                  .array(
                    z
                      .object({
                        profile: z
                          .object({
                            name: z.string().optional(),
                          })
                          .optional(),
                        wa_id: z.string().optional(),
                      })
                      .passthrough()
                  )
                  .optional(),
                messages: z.array(messageSchema).optional(),
                statuses: z.array(statusSchema).optional(),
              })
              .passthrough(),
          })
        ),
      })
    )
    .optional(),
});
