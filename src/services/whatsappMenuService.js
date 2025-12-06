// Service to build WhatsApp LIST message showing active, launchable campaigns
import { prisma } from "../config/prismaClient.js";

/**
 * Build WhatsApp LIST message showing active, launchable campaigns
 */
export const buildWhatsappMenuList = async () => {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "Active",
      keyword: { some: {} },              // at least 1 keyword
      entry_contentkeyid: { not: null },  // has an entry content key
    },
    select: {
      campaignid: true,
      campaignname: true,
      entry_contentkeyid: true,
      keymapping: {
        select: {
          contentkeyid: true,
          content: {
            select: {
              contentid: true,
              status: true,
              isdeleted: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { campaign_id: "asc" },
  });

  // Filter to only those where the entry content really exists & is not deleted
  const launchableCampaigns = campaigns.filter((c) => {
    const km = c.keymapping.find(
      (k) => k.contentkeyid === c.entry_contentkeyid
    );
    const content = km?.content;
    if (!content) return false;
    if (content.isdeleted) return false;
    // Optional: filter out Draft content if needed
    // if ((content.status || "").toLowerCase() === "draft") return false;
    return true;
  });

  if (!launchableCampaigns.length) {
    return {
      type: "text",
      text: {
        body:
          "There are no campaigns available right now. Please try again later.",
      },
    };
  }

  const rows = launchableCampaigns.map((c) => ({
    id: `campaign_${c.campaignid}`,       // used in list_reply handler
    title: c.campaignname.slice(0, 24),
  }));

  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Available Campaigns:" },
      footer: { text: "Choose one to start the campaign." },
      action: {
        button: "View Campaigns",
        sections: [
          {
            title: "Campaign List",
            rows,
          },
        ],
      },
    },
  };
};
