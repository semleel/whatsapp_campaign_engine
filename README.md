# Interactive Campaign Engine on WhatsApp

This backend module integrates **Meta’s WhatsApp Business API** with a Supabase-powered backend to support an **Interactive Campaign Engine**.
It allows automated WhatsApp interactions, campaign participation via keywords, and real-time message routing for campaign workflows.

---

## 🚀 Features

* Real-time WhatsApp message handling
* Supabase integration for campaign data and message logging
* Keyword-based campaign recognition and routing
* Auto-reply system with fallback and guided responses
* Live API communication for campaign management
* Delivery status tracking (sent, delivered, read) via webhook

---

## 🧱 Prerequisites

Before starting, ensure the following are installed:

| Tool        | Description                             | Download                                                                 |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------ |
| **Node.js** | Runtime for backend server              | [https://nodejs.org/](https://nodejs.org/)                               |
| **Git**     | Version control                         | [https://git-scm.com/downloads](https://git-scm.com/downloads)           |
| **ngrok**   | Expose local server for webhook testing | [https://ngrok.com/download](https://ngrok.com/download)                 |
| **Postman** | API testing tool                        | [https://www.postman.com/downloads/](https://www.postman.com/downloads/) |

---

## ⚙️ Environment Setup

### 1️⃣ Clone this repository

```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd whatsapp-backend
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Configure your own ngrok account

Each developer should use their **own ngrok authtoken** to avoid conflicts.

```bash
ngrok config add-authtoken <your-own-ngrok-token>
ngrok http 3000
```

Copy the forwarding URL (e.g., `https://abc123.ngrok-free.app`) and set it as the webhook in your
👉 [Meta Developer Dashboard](https://developers.facebook.com/) → *App → WhatsApp → Configuration.*

> 🧩 This setup ensures everyone can test independently without interfering with teammates’ tunnels.

---

### 4️⃣ Create your `.env` file

Duplicate `.env.example` and rename it to `.env`, then fill in your own values:

```bash
WEBHOOK_VERIFY_TOKEN=your_verify_token
WHATSAPP_TOKEN=your_meta_access_token
SUPABASE_URL=https://xyzcompany.supabase.co
SUPABASE_KEY=your_supabase_service_key
PORT=3000
```

---

## 🧩 Running the Server

Start the development server:

```bash
npm run dev
```

You should see:

```
✅ Server running on port 3000
```

To expose it for Meta’s webhook testing:

```bash
ngrok http 3000
```

---

## 💬 WhatsApp Message API Testing (Postman)

Use Postman to send messages through the WhatsApp API:

**Example payload**

```json
{
  "messaging_product": "whatsapp",
  "to": "6017XXXXXXX",
  "type": "text",
  "text": { "body": "Hello from Interactive Campaign Engine!" }
}
```

**Example workspace**
👉 [Postman Workspace](https://khang-hao-968430.postman.co/workspace/KH's-Workspace~df513b93-8585-4e48-85ba-568be5276a75/collection/49601989-eceb0360-9fb7-4d39-a7b6-1a8d9ef07225?action=share&creator=49601989)

---

## 🧑‍💻 Git Workflow Convention

> ⚠️ Do not commit directly to the `main` branch.

1. **Create your branch**

   ```bash
   git checkout -b <name>-<feature>
   # Example: yisem-backendIntegration
   ```

2. **Pull before committing**

   ```bash
   git pull origin main
   ```

3. **Push your branch**

   ```bash
   git push origin <branch-name>
   ```

4. **Create a pull request (PR)** for review before merging into `main`.

---

## 🧠 Notes

* Each team module (WhatsApp Gateway, Content Engine, Campaign Engine, Backend Integration) connects through **Supabase**.
* Never commit `.env` files — they are sensitive. Ensure `.env` is in `.gitignore`.
* If your **WhatsApp access token** expires, regenerate it via **Meta Developer Portal → WhatsApp → API Setup**.
* Your code already supports **provider_msg_id** tracking, so status updates (`sent`, `delivered`, `read`) are automatically reflected in Supabase.

---

## 🏗 Folder Structure

```bash
whatsapp-backend/
├── index.js
├── package.json
├── .env
├── /controllers
│   └── webhookController.js
├── /services
│   ├── supabaseService.js
│   └── whatsappService.js
├── /validators
│   └── webhookValidator.js
├── /utils
│   └── logger.js
└── /routes
    └── webhookRoutes.js
```

---

## 🌐 Future Setup (Option C – Shared Demo URL)

When your team is ready for a shared testing environment:

* Deploy the backend to **Render / Railway / Fly.io**, or use **ngrok reserved domains**.
* Use one stable webhook URL in Meta for end-to-end campaign testing.
* Keep individual tunnels (Option B) for ongoing module development.

---

## 📚 References

* [Meta for Developers – WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
* [Supabase Documentation](https://supabase.com/docs)
* [ngrok Documentation](https://ngrok.com/docs)
* [Node.js API Docs](https://nodejs.org/docs/latest/api/)
