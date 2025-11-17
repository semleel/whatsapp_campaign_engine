import prisma from "../config/prismaClient.js";

// GET /api/system/whatsapp-config
export async function getWhatsAppConfig(req, res) {
    try {
        const config = await prisma.whatsapp_config.findFirst({
            where: { is_active: true },
            orderBy: { id: "desc" },
        });

        if (!config) {
            // Default values for first-time setup
            return res.json({
                display_name: "",
                phone_number: "",
                phone_number_id: "",
                waba_id: "",
                verify_token: "",
                api_version: "v21.0",
                is_active: true,
            });
        }

        return res.json(config);
    } catch (err) {
        console.error("getWhatsAppConfig error:", err);
        return res.status(500).json({ message: err.message });
    }
}

// PUT /api/system/whatsapp-config
export async function upsertWhatsAppConfig(req, res) {
    try {
        const body = req.body || {};

        const {
            id,
            display_name,
            phone_number,
            phone_number_id,
            waba_id,
            verify_token,
            api_version,
            is_active,
        } = body;

        if (!phone_number || !phone_number_id || !verify_token) {
            return res.status(400).json({
                message: "phone_number, phone_number_id and verify_token are required.",
            });
        }

        // TODO: get current admin id from auth middleware/session
        const updatedByAdminId = null;

        const data = {
            display_name: display_name ?? null,
            phone_number,
            phone_number_id,
            waba_id: waba_id ?? null,
            verify_token,
            api_version: api_version || "v21.0",
            is_active: is_active ?? true,
            updatedat: new Date(),
            updatedby_adminid: updatedByAdminId,
        };

        let result;

        if (id) {
            // Update existing row
            result = await prisma.whatsapp_config.update({
                where: { id: Number(id) },
                data,
            });
        } else {
            // (Optional) deactivate existing rows if you only ever want 1 active config
            // await prisma.whatsapp_config.updateMany({
            //   where: { is_active: true },
            //   data: { is_active: false },
            // });

            result = await prisma.whatsapp_config.create({ data });
        }

        return res.json(result);
    } catch (err) {
        console.error("upsertWhatsAppConfig error:", err);
        return res.status(500).json({ message: err.message });
    }
}
