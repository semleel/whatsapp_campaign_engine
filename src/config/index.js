const config = {
  server: {
    port: process.env.PORT || 3000,
    webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
  },
  SESSION_EXPIRY_MINUTES: Number(process.env.SESSION_EXPIRY_MINUTES || 120),
};

export const SESSION_EXPIRY_MINUTES = config.SESSION_EXPIRY_MINUTES;

export default config;
