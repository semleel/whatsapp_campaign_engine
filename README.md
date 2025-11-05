# Interactive Campaign Engine on WhatsApp  

This project handles **WhatsApp API integration**, message routing, and backend communication for the Interactive Campaign Engine.  
It connects WhatsApp users to campaign data through Supabase and allows automated responses via Meta’s WhatsApp Business API.

---

## 🚀 Features  
- Real-time WhatsApp message handling  
- Supabase integration for campaign data and message logging  
- Keyword-based campaign recognition  
- Auto-reply system with fallback messages  
- Live API communication for campaign management  

---

## 🧱 Prerequisites  
Before you start, make sure you have the following installed:

- **Node.js** → [https://nodejs.org/](https://nodejs.org/)  
- **Git** → [https://git-scm.com/downloads](https://git-scm.com/downloads)  
- **ngrok** (for webhook testing) → Install from Microsoft Store or [https://ngrok.com/download](https://ngrok.com/download)  
- **Postman** (for WhatsApp API testing) → [https://www.postman.com/downloads/](https://www.postman.com/downloads/)  

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

### 3️⃣ Configure ngrok
Run the following command to connect your account:
```bash
ngrok config add-authtoken 34SlHR7rkiMckXvOTHb8pQBsNEk_2DaCcBPpWbnpWAun8Av1t
```
Then, start ngrok to expose your webhook:
```bash
ngrok http 3000
```
Copy the Forwarding URL (e.g., `https://abc123.ngrok.io`) and paste it into your Webhook URL in the [Meta Developer Dashboard](https://developers.facebook.com/).

### 4️⃣ Create a `.env` file
Create a `.env` file and copy everything inside the .env.example.

---

## 🧩 Running the Server
To start the backend server:
```bash
npm run dev
```
You should see:
```nginx
Webhook running on port 3000
```

---

## 💬 WhatsApp Message API Testing
You can test the API using Postman:
👉 [View Example Postman Workspace](https://khang-hao-968430.postman.co/workspace/KH's-Workspace~df513b93-8585-4e48-85ba-568be5276a75/collection/49601989-eceb0360-9fb7-4d39-a7b6-1a8d9ef07225?action=share&creator=49601989)
### Sample test payload:
```json
{
  "messaging_product": "whatsapp",
  "to": "6017XXXXXXX",
  "type": "text",
  "text": { "body": "Hello from Interactive Campaign Engine!" }
}
```

---

## 🧑‍💻 Git Workflow Convention
### ⚠️ Do not make changes directly in the `main` branch.

1. Create your own branch (use `<name>-<feature>` naming):
```bash
git checkout -b yisem-backendIntegration
```
2. Pull the latest updates before committing:
```bash
git pull origin main
```
3. Push your branch:
```bash
git push origin yisem-backendIntegration
```
4. Create a pull request for review before merging into `main`.

---

## 🧠 Notes
* Each campaign module (Content Engine, Campaign Engine, Integration Module) will connect through Supabase APIs.
* Avoid committing sensitive `.env` files — add them to `.gitignore`.
* If WhatsApp token expires, regenerate it under your *Meta App* → *WhatsApp* → *API Setup* section.

---

## 📁 Folder Structure (example)
```bash
whatsapp-backend/
├── index.js
├── package.json
├── .env <-- .env file here
├── /services
│   └── supabaseClient.js
├── /controllers
│   └── messageController.js
├── /routes
│   └── webhookRoutes.js
└── /utils
    └── formatters.js
```

---

## 📚 References

* [Meta for Developers – WhatsApp Business API](https://developers.facebook.com/docs/whatsapp?utm_source=chatgpt.com)
* [Supabase Documentation](https://supabase.com/docs)
* [ngrok Documentation](https://ngrok.com/docs/what-is-ngrok)
* [Node.js Documentation](https://nodejs.org/docs/latest/api/)
