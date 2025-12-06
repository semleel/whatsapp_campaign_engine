// app/content/templates/[id]/page.tsx

"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { showCenteredAlert } from "@/lib/showAlert";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

// ------------------------------
// Types
// ------------------------------

type ButtonItem = {
  id: string;
  type: "visit_website" | "call_phone" | "quick_reply";
  label: string;
  url?: string;
  phone?: string;
};

type TemplateCategory =
  | "Marketing"
  | "Utility"
  | "Authentication"
  | string
  | null;

type TemplateActionType = "choice" | "message" | "input" | "api";

type TemplateData = {
  contentid: number;
  title: string;
  type: TemplateActionType;
  status: string;
  lang: string;
  category: TemplateCategory;
  body: string;
  description?: string | null;
  mediaurl?: string | null;
  expiresat?: string | null;
  placeholders?: Record<string, unknown> | null;
  buttons: ButtonItem[];
  headerType?: "none" | "text" | "media";
  headerText?: string | null;
  headerMediaType?: "image" | "video" | "document";
  isdeleted?: boolean | null;
  interactiveType?: TemplateInteractiveType;
  menu?: TemplateMenu | null;
};

type TemplateInteractiveType = "buttons" | "menu" | "default";

type TemplateMenuOption = {
  id: string;
  title: string;
  description?: string;
};

type TemplateMenuSection = {
  id: string;
  title?: string;
  options: TemplateMenuOption[];
};

type TemplateMenu = {
  buttonLabel: string;
  sections: TemplateMenuSection[];
};

const TEMPLATE_CATEGORY_OPTIONS: {
  value: TemplateCategory;
  label: string;
  subtitle: string;
  icon: string;
}[] = [
  {
    value: "Marketing",
    label: "Marketing",
    subtitle: "One-to-many bulk broadcast marketing messages",
    icon: "[M]",
  },
  {
    value: "Utility",
    label: "Utility",
    subtitle: "Transactional updates triggered by a user action",
    icon: "[U]",
  },
  {
    value: "Authentication",
    label: "Authentication",
    subtitle: "One-time passwords and login verification",
    icon: "[A]",
  },
];

const SUPPORTED_LOCALES = [
  { value: "en", label: "English" },
  { value: "my", label: "Bahasa Melayu" },
  { value: "cn", label: "Chinese" },
];

function normalizeStatus(status: string | null | undefined): string {
  const value = (status || "").trim();
  if (!value) return "Active";
  const lower = value.toLowerCase();
  if (lower === "archived") return "Archived";
  if (lower === "draft" || lower === "approved") return "Active";
  return value;
}

function normalizeInteractiveType(
  value: string | null | undefined,
  hasMenu: unknown,
  buttons: ButtonItem[] | null | undefined
): TemplateInteractiveType {
  const lower = (value || "").toLowerCase();
  if (lower === "default") return "default";
  if (lower === "menu" || hasMenu) return "menu";
  if (lower === "buttons") return "buttons";
  if (Array.isArray(buttons) && buttons.length > 0) return "buttons";
  return "default";
}

function normalizeTemplateType(value: string | null | undefined): TemplateActionType {
  const normalized = (value || "").toLowerCase();
  if (
    normalized === "choice" ||
    normalized === "message" ||
    normalized === "input" ||
    normalized === "api"
  ) {
    return normalized as TemplateActionType;
  }
  return "message";
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

const MAX_QUICK_REPLIES = 3;
const MAX_MENU_OPTIONS = 10;
const MAX_MENU_BUTTON_LABEL = 24;
const MAX_MENU_OPTION_TITLE = 24;
const MAX_MENU_OPTION_DESC = 72;
const BUTTON_LABEL_SOFT_LIMIT = 20;
const BUTTON_LABEL_HARD_LIMIT = 24;
const BUTTON_CONFIG_ERROR =
  "Invalid button configuration: WhatsApp allows up to 3 reply buttons OR up to 2 CTA buttons (1 website + 1 phone). Mixing types is not allowed.";
const MENU_CONFIG_ERROR =
  "List message is invalid. Provide a button label, at least one section, and 1-10 options in total. Every option must have a title.";

const countTotalOptions = (sections: TemplateMenuSection[]) =>
  sections.reduce((sum, sec) => sum + (sec.options?.length || 0), 0);

function ensureMenu(existing: TemplateMenu | null | undefined): TemplateMenu {
  const normalizeOption = (opt: TemplateMenuOption) => ({
    id: opt?.id || generateId(),
    title: (opt?.title || "").slice(0, MAX_MENU_OPTION_TITLE),
    description: (opt?.description || "").slice(0, MAX_MENU_OPTION_DESC),
  });

  const normalizeSections = (sections?: TemplateMenuSection[] | null) =>
    (sections || []).map((sec) => ({
      id: sec?.id || generateId(),
      title: (sec?.title || "").slice(0, MAX_MENU_BUTTON_LABEL),
      options: Array.isArray(sec?.options)
        ? sec.options.map((opt) => normalizeOption(opt))
        : [],
    }));

  const legacyOptions = Array.isArray((existing as any)?.options)
    ? (((existing as any).options as TemplateMenuOption[]) || []).map((opt) =>
        normalizeOption(opt)
      )
    : [];

  let sections = normalizeSections((existing as any)?.sections);

  if (!sections.length && legacyOptions.length) {
    sections = [
      {
        id: generateId(),
        title: "",
        options: legacyOptions,
      },
    ];
  }

  if (!sections.length) {
    return {
      buttonLabel: "Main Menu",
      sections: [
        {
          id: generateId(),
          title: "",
          options: [{ id: generateId(), title: "Option 1", description: "" }],
        },
      ],
    };
  }

  return {
    buttonLabel:
      (existing?.buttonLabel || "Main Menu").slice(0, MAX_MENU_BUTTON_LABEL) ||
      "Main Menu",
    sections,
  };
}

function validateButtons(buttons: ButtonItem[]): string | null {
  const quickReplies = buttons.filter((b) => b.type === "quick_reply");
  const websiteButtons = buttons.filter((b) => b.type === "visit_website");
  const callButtons = buttons.filter((b) => b.type === "call_phone");

  const hasQuick = quickReplies.length > 0;
  const hasCTA = websiteButtons.length > 0 || callButtons.length > 0;

  if (hasQuick && hasCTA) {
    return BUTTON_CONFIG_ERROR;
  }
  if (quickReplies.length > MAX_QUICK_REPLIES) {
    return BUTTON_CONFIG_ERROR;
  }
  if (websiteButtons.length > 1 || callButtons.length > 1) {
    return BUTTON_CONFIG_ERROR;
  }
  if (hasCTA && websiteButtons.length + callButtons.length > 2) {
    return BUTTON_CONFIG_ERROR;
  }
  if (buttons.some((b) => (b.label || "").length > BUTTON_LABEL_HARD_LIMIT)) {
    return "Button text is too long. Max 20 characters recommended (24 hard limit).";
  }
  return null;
}

function validateMenu(menu: TemplateMenu | null | undefined): string | null {
  if (!menu) return "Menu is required.";
  const label = (menu.buttonLabel || "").trim();
  if (!label) return "Menu button label is required.";
  if (label.length > MAX_MENU_BUTTON_LABEL) {
    return `Menu button label must be at most ${MAX_MENU_BUTTON_LABEL} characters.`;
  }
  const sections = Array.isArray(menu.sections) ? menu.sections : [];
  if (sections.length < 1) return "At least one section is required.";
  const totalOptions = countTotalOptions(sections);
  if (totalOptions < 1) return "At least one menu option is required.";
  if (totalOptions > MAX_MENU_OPTIONS) return "A WhatsApp list message can contain up to 10 options.";
  for (const sec of sections) {
    const opts = Array.isArray(sec.options) ? sec.options : [];
    if (opts.length < 1) return "Each section needs at least one option.";
    for (const opt of opts) {
      const title = (opt.title || "").trim();
      if (!title) return "Every menu option needs a title.";
      if (title.length > MAX_MENU_OPTION_TITLE) {
        return `Option titles must be at most ${MAX_MENU_OPTION_TITLE} characters.`;
      }
      if ((opt.description || "").length > MAX_MENU_OPTION_DESC) {
        return `Descriptions must be at most ${MAX_MENU_OPTION_DESC} characters.`;
      }
    }
  }
  return null;
}

// Small helpers for modals
type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
};

type FeedbackState = {
  open: boolean;
  title: string;
  message?: string;
  variant?: "success" | "error" | "confirm";
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

const INLINE_FORMATTERS = [
  {
    regex: /\*\*(.+?)\*\*/g,
    wrap: (content: string, key: string) => <strong key={key}>{content}</strong>,
  },
  {
    regex: /\*(.+?)\*/g,
    wrap: (content: string, key: string) => <em key={key}>{content}</em>,
  },
  {
    regex: /~~(.+?)~~/g,
    wrap: (content: string, key: string) => <s key={key}>{content}</s>,
  },
  {
    regex: /`([^`]+)`/g,
    wrap: (content: string, key: string) => (
      <code key={key} className="bg-muted px-1 rounded text-[11px]">
        {content}
      </code>
    ),
  },
];

function formatWhatsAppLine(line: string, keyPrefix: string) {
  let segments: React.ReactNode[] = [line];

  INLINE_FORMATTERS.forEach((fmt, fmtIdx) => {
    const next: React.ReactNode[] = [];

    segments.forEach((seg, segIdx) => {
      if (typeof seg !== "string") {
        next.push(seg);
        return;
      }

      const regex = new RegExp(fmt.regex.source, fmt.regex.flags);
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(seg)) !== null) {
        if (match.index > lastIndex) {
          next.push(seg.slice(lastIndex, match.index));
        }

        next.push(fmt.wrap(match[1], `${keyPrefix}-${fmtIdx}-${segIdx}-${next.length}`));
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < seg.length) {
        next.push(seg.slice(lastIndex));
      }
    });

    segments = next;
  });

  return segments;
}

function renderFormattedLines(text: string, placeholder: string) {
  const lines = text ? text.split("\n") : [placeholder];

  return lines.map((line, idx) => {
    const content = line ? formatWhatsAppLine(line, `line-${idx}`) : [placeholder];
    return <p key={`line-${idx}`}>{content}</p>;
  });
}

// ------------------------------
// Component
// ------------------------------

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const templateId = useMemo(
    () => (params?.id ? Number(params.id) : NaN),
    [params]
  );
  const { canView, canUpdate, canArchive, loading: privLoading } = usePrivilege("content");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buttonError, setButtonError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  const [form, setForm] = useState<TemplateData>({
    contentid: 0,
    title: "",
    type: "message",
    status: "Active",
    lang: "en",
    category: "Marketing",
    body: "",
    description: "",
    mediaurl: null,
    expiresat: "",
    placeholders: null,
    buttons: [],
    headerType: "none",
    headerText: "",
    headerMediaType: "image",
    isdeleted: null,
    interactiveType: "default",
    menu: null,
  });

  // Modal states
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
  });

  const [feedback, setFeedback] = useState<FeedbackState>({
    open: false,
    title: "",
    message: "",
  });

  const openConfirm = (cfg: Partial<ConfirmState>) => {
    setConfirm({
      open: true,
      title: cfg.title || "Are you sure?",
      message: cfg.message || "",
      confirmLabel: cfg.confirmLabel || "Confirm",
      cancelLabel: cfg.cancelLabel || "Cancel",
      onConfirm: cfg.onConfirm,
    });
  };

  const closeConfirm = () =>
    setConfirm((s) => ({
      ...s,
      open: false,
    }));

  const openFeedback = (cfg: Partial<FeedbackState>) => {
    setFeedback({
      open: true,
      title: cfg.title || "",
      message: cfg.message || "",
      primaryLabel: cfg.primaryLabel || "OK",
      secondaryLabel: cfg.secondaryLabel,
      onPrimary: cfg.onPrimary,
      onSecondary: cfg.onSecondary,
    });
  };

  const closeFeedback = () =>
    setFeedback((s) => ({
      ...s,
      open: false,
    }));

  // ------------------------------
  // Load template
  // ------------------------------

  useEffect(() => {
    if (!templateId) return;

    const load = async () => {
      try {
        if (privLoading) return;
        if (!canView) {
          setError("You do not have permission to view templates.");
          setLoading(false);
          return;
        }
        setLoading(true);

        // ✅ use shared API client
        const data = await Api.getTemplate(templateId);

        const isdeleted: boolean | null = (data as any).isdeleted ?? null;
        const rawPlaceholders =
          ((data as any).placeholders as Record<string, unknown> | null) ||
          null;
        const placeholders = rawPlaceholders ? { ...rawPlaceholders } : null;
        if (placeholders) {
          delete (placeholders as any).footerText;
        }

        const headerType: TemplateData["headerType"] =
          (data as any).headerType ||
          (placeholders?.headerType as TemplateData["headerType"]) ||
          ((data as any).mediaurl ? "media" : "none");

        const headerText: string =
          (data as any).headerText ||
          (placeholders?.headerText as string | null) ||
          "";

        const headerMediaType: TemplateData["headerMediaType"] =
          (data as any).headerMediaType ||
          (placeholders?.headerMediaType as TemplateData["headerMediaType"]) ||
          "image";

        const buttons: ButtonItem[] =
          (data as any).buttons ||
          ((placeholders?.buttons as ButtonItem[] | undefined) ?? []);

        const menuFromData =
          (data as any).menu ??
          (placeholders?.menu as TemplateMenu | null | undefined) ??
          null;
        const interactiveType: TemplateInteractiveType = normalizeInteractiveType(
          (data as any).interactiveType as string | null | undefined,
          menuFromData,
          buttons
        );
        const normalizedMenu =
          interactiveType === "menu" ? ensureMenu(menuFromData) : null;
        const normalizedButtons =
          interactiveType === "buttons" ? buttons : [];

        setForm({
          contentid: (data as any).contentid,
          title: (data as any).title || "",
          type: normalizeTemplateType((data as any).type),
          status: normalizeStatus((data as any).status),
          lang:
            ((data as any).lang || (data as any).defaultlang || "en")?.trim() ||
            "en",
          category: (data as any).category || "Marketing",
          body: (data as any).body || (data as any).description || "",
          description: (data as any).description || "",
          mediaurl: (data as any).mediaurl || null,
          expiresat: (data as any).expiresat || "",
          placeholders,
          buttons: normalizedButtons,
          headerType,
          headerText,
          headerMediaType,
          isdeleted,
          interactiveType,
          menu: normalizedMenu,
        });
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Error loading template");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [templateId, canView, privLoading]);

  // ------------------------------
  // Buttons helpers
  // ------------------------------

  const addButton = (type: ButtonItem["type"]) => {
    setButtonError(null);
    setMenuError(null);
    setForm((prev) => ({
      ...prev,
      interactiveType: "buttons",
    }));

    setForm((prev) => {
      const quickReplies = prev.buttons?.filter((b) => b.type === "quick_reply") || [];
      const websiteButtons = prev.buttons?.filter((b) => b.type === "visit_website") || [];
      const callButtons = prev.buttons?.filter((b) => b.type === "call_phone") || [];

      const hasQuick = quickReplies.length > 0;
      const hasCTA = websiteButtons.length > 0 || callButtons.length > 0;

      if (type === "quick_reply") {
        if (hasCTA) {
          setButtonError("You cannot mix quick replies with website/phone buttons in the same template.");
          return prev;
        }
        if (quickReplies.length >= MAX_QUICK_REPLIES) {
          setButtonError("WhatsApp only allows up to 3 quick reply buttons.");
          return prev;
        }
      } else {
        if (hasQuick) {
          setButtonError("You cannot mix quick replies with website/phone buttons in the same template.");
          return prev;
        }
        if (type === "visit_website" && websiteButtons.length >= 1) {
          setButtonError("You can only have one website and one phone button per template.");
          return prev;
        }
        if (type === "call_phone" && callButtons.length >= 1) {
          setButtonError("You can only have one website and one phone button per template.");
          return prev;
        }
        if (websiteButtons.length + callButtons.length >= 2) {
          setButtonError("You can only have one website and one phone button per template.");
          return prev;
        }
      }

      const nextButton: ButtonItem = {
        id: generateId(),
        type,
        label:
          type === "visit_website"
            ? "Visit website"
            : type === "call_phone"
            ? "Call now"
            : "Quick reply",
        url: type === "visit_website" ? "" : undefined,
        phone: type === "call_phone" ? "" : undefined,
      };

      return {
        ...prev,
        buttons: [...(prev.buttons || []), nextButton],
      };
    });
  };

  const updateButton = (id: string, changes: Partial<ButtonItem>) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons!.map((btn) =>
        btn.id === id
          ? {
              ...btn,
              ...changes,
              label:
                changes.label !== undefined
                  ? changes.label.slice(0, BUTTON_LABEL_HARD_LIMIT)
                  : btn.label,
            }
          : btn
      ),
    }));
  };

  const removeButton = (id: string) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons!.filter((btn) => btn.id !== id),
    }));
  };

  const handleInteractiveTypeChange = (type: TemplateInteractiveType) => {
    setButtonError(null);
    setMenuError(null);
    setForm((prev) => {
      if (type === "menu") {
        return {
          ...prev,
          interactiveType: "menu",
          buttons: [],
          menu: ensureMenu(prev.menu),
        };
      }
      if (type === "default") {
        return {
          ...prev,
          interactiveType: "default",
          buttons: [],
          menu: null,
        };
      }
      return {
        ...prev,
        interactiveType: "buttons",
        menu: null,
      };
    });
  };

  // ------------------------------
  // Menu helpers
  // ------------------------------

  const addMenuSection = () => {
    setMenuError(null);
    setForm((prev) => {
      const menu = ensureMenu(prev.menu);
      return {
        ...prev,
        menu: {
          ...menu,
          sections: [
            ...menu.sections,
            { id: generateId(), title: "", options: [] },
          ],
        },
      };
    });
  };

  const removeMenuSection = (sectionId: string) => {
    setMenuError(null);
    setForm((prev) => {
      const menu = ensureMenu(prev.menu);
      if (menu.sections.length <= 1) {
        return prev;
      }
      return {
        ...prev,
        menu: {
          ...menu,
          sections: menu.sections.filter((sec) => sec.id !== sectionId),
        },
      };
    });
  };

  const updateMenuSection = (
    sectionId: string,
    changes: Partial<TemplateMenuSection>
  ) => {
    setForm((prev) => {
      const menu = ensureMenu(prev.menu);
      return {
        ...prev,
        menu: {
          ...menu,
          sections: menu.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  ...changes,
                  title:
                    changes.title !== undefined
                      ? changes.title.slice(0, MAX_MENU_BUTTON_LABEL)
                      : sec.title,
                }
              : sec
          ),
        },
      };
    });
  };

  const addMenuOption = (sectionId: string) => {
    setMenuError(null);
    setButtonError(null);
    setForm((prev) => {
      const menu = ensureMenu(prev.menu);
      const total = countTotalOptions(menu.sections);
      if (total >= MAX_MENU_OPTIONS) {
        setMenuError("A WhatsApp list message can contain up to 10 options.");
        return prev;
      }
      return {
        ...prev,
        menu: {
          ...menu,
          sections: menu.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  options: [
                    ...(sec.options || []),
                    { id: generateId(), title: "", description: "" },
                  ],
                }
              : sec
          ),
        },
      };
    });
  };

  const updateMenuOption = (
    sectionId: string,
    id: string,
    changes: Partial<TemplateMenuOption>
  ) => {
    setForm((prev) => {
      const menu = ensureMenu(prev.menu);
      return {
        ...prev,
        menu: {
          ...menu,
          sections: menu.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  options: (sec.options || []).map((opt) =>
                    opt.id === id
                      ? {
                          ...opt,
                          title:
                            changes.title !== undefined
                              ? changes.title.slice(0, MAX_MENU_OPTION_TITLE)
                              : opt.title,
                          description:
                            changes.description !== undefined
                              ? changes.description.slice(
                                  0,
                                  MAX_MENU_OPTION_DESC
                                )
                              : opt.description,
                        }
                      : opt
                  ),
                }
              : sec
          ),
        },
      };
    });
  };

  const removeMenuOption = (sectionId: string, id: string) => {
    setMenuError(null);
    setForm((prev) => {
      const menu = ensureMenu(prev.menu);
      return {
        ...prev,
        menu: {
          ...menu,
          sections: menu.sections.map((sec) =>
            sec.id === sectionId
              ? {
                  ...sec,
                  options: (sec.options || []).filter((opt) => opt.id !== id),
                }
              : sec
          ),
        },
      };
    });
  };

  // ------------------------------
  // Save / Archive / Recover
  // ------------------------------

  const doSave = async () => {
    if (!canUpdate) {
      await showCenteredAlert("You do not have permission to update templates.");
      return;
    }
    if (!form.title.trim()) {
      await showCenteredAlert("Title is required");
      openFeedback({
        title: "Missing title",
        message: "Please provide a title before saving the template.",
      });
      return;
    }

    setButtonError(null);
    setMenuError(null);
    setSaving(true);
    try {
      if (form.interactiveType === "buttons") {
        const err = validateButtons(form.buttons || []);
        if (err) {
          setButtonError(err);
          await showCenteredAlert(
            err === BUTTON_CONFIG_ERROR
              ? BUTTON_CONFIG_ERROR
              : err
          );
          setSaving(false);
          return;
        }
      } else if (form.interactiveType === "menu") {
        const menuToValidate = ensureMenu(form.menu);
        const err = validateMenu(menuToValidate);
        if (err) {
          setMenuError(err);
          await showCenteredAlert(
            MENU_CONFIG_ERROR
          );
          setSaving(false);
          return;
        }
      }

      const finalMediaUrl =
        form.headerType === "media" && form.mediaurl?.trim()
          ? form.mediaurl.trim()
          : null;

      const expiresAtIso = form.expiresat
        ? new Date(form.expiresat).toISOString()
        : null;

      const apiInteractiveType =
        form.interactiveType === "default" ? undefined : form.interactiveType;

      const placeholderData = {
        headerText: form.headerType === "text" ? form.headerText || "" : null,
        headerType: form.headerType,
        headerMediaType:
          form.headerType === "media" ? form.headerMediaType : null,
        buttons: form.buttons,
        interactiveType: apiInteractiveType,
      };

      const cleanedPlaceholders = form.placeholders
        ? { ...form.placeholders }
        : {};
      delete (cleanedPlaceholders as any).footerText;

      const payload = {
        title: form.title,
        type: form.type,
        category: form.category || null,
        status: form.status,
        lang: form.lang,
        defaultLang: form.lang, // ✅ match TemplatePayload
        body: form.body,
        description: form.description || form.body || null,
        mediaUrl: finalMediaUrl,
        expiresat: expiresAtIso,
        headerText: placeholderData.headerText,
        headerType: placeholderData.headerType,
        headerMediaType: placeholderData.headerMediaType,
        buttons:
          form.interactiveType === "buttons"
            ? placeholderData.buttons?.slice(0, MAX_QUICK_REPLIES)
            : [],
        menu: form.interactiveType === "menu" ? ensureMenu(form.menu) : null,
        interactiveType: apiInteractiveType,
        placeholders: {
          ...cleanedPlaceholders,
          ...placeholderData,
          menu: form.interactiveType === "menu" ? ensureMenu(form.menu) : undefined,
        },
        isdeleted: form.isdeleted,
        expiresAt: expiresAtIso || undefined,
      };

      // 1) Update main template record via shared Api client
      await Api.updateTemplate(form.contentid, payload as any);

      // This shows the "Heads up" modal.
      await showCenteredAlert("Template updated successfully!");

      // After user clicks OK on the heads up modal, go straight back to library.
      router.push("/content/templates");
    } catch (e: any) {
      console.error(e);
      await showCenteredAlert(e.message || "Failed to update template.");
      openFeedback({
        title: "Save failed",
        message: e.message || "Unable to save this template.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Soft delete (archive)
  const doDelete = async () => {
    setSaving(true);

    try {
      await Api.softDeleteTemplate(form.contentid);

      setForm((prev) => ({ ...prev, isdeleted: true }));

      openFeedback({
        title: "Template archived",
        message:
          "This template has been archived and will no longer appear in the main library.",
        variant: "success",
        primaryLabel: "Back to library",
        onPrimary: () => router.push("/content/templates"),
      });
    } catch (err: any) {
      openFeedback({
        title: "Delete failed",
        message: err instanceof Error ? err.message : String(err),
        variant: "error",
        primaryLabel: "Close",
      });
    } finally {
      setSaving(false);
    }
  };

  // Hard delete (permanent)
  const doHardDelete = async () => {
    setSaving(true);

    try {
      await Api.deleteTemplate(form.contentid);

      openFeedback({
        title: "Template deleted",
        message: "This template has been removed permanently.",
        variant: "success",
        primaryLabel: "Back to library",
        onPrimary: () => router.push("/content/templates"),
      });
    } catch (err: any) {
      openFeedback({
        title: "Delete failed",
        message: err instanceof Error ? err.message : String(err),
        variant: "error",
        primaryLabel: "Close",
      });
    } finally {
      setSaving(false);
    }
  };

  // Recover from archive
  const doRecover = async () => {
    setSaving(true);
    try {
      await Api.recoverTemplate(form.contentid);

      setForm((prev) => ({ ...prev, isdeleted: false }));

      openFeedback({
        title: "Template recovered",
        message: "This template is now active again in the library.",
        variant: "success",
        primaryLabel: "Back to library",
        secondaryLabel: "Stay here",
        onPrimary: () => router.push("/content/templates"),
      });
    } catch (err: any) {
      openFeedback({
        title: "Recover failed",
        message: err instanceof Error ? err.message : String(err),
        variant: "error",
        primaryLabel: "Close",
      });
    } finally {
      setSaving(false);
    }
  };

  // Button click handlers
  const handleSaveClick = () => {
    openConfirm({
      title: "Save changes?",
      message:
        "Are you sure you want to save the changes made to this template?",
      confirmLabel: "Save",
      cancelLabel: "Cancel",
      onConfirm: () => {
        closeConfirm();
        void doSave();
      },
    });
  };

  const handleCancelClick = () => {
    openConfirm({
      title: "Discard changes?",
      message: "Any unsaved changes will be lost if you leave this page.",
      confirmLabel: "Discard",
      cancelLabel: "Stay",
      onConfirm: () => {
        closeConfirm();
        router.push("/content/templates");
      },
    });
  };

  const handleDeleteClick = () => {
    if (form.isdeleted) {
      openConfirm({
        title: "Delete template?",
        message:
          "This will permanently delete the template and it cannot be recovered.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        onConfirm: () => {
          closeConfirm();
          void doHardDelete();
        },
      });
      return;
    }

    openConfirm({
      title: "Archive template?",
      message:
        "This will archive the template so it no longer appears in the main library. You can recover it later.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      onConfirm: () => {
        closeConfirm();
        void doDelete();
      },
    });
  };

  const handleRecoverClick = () => {
    openConfirm({
      title: "Recover template?",
      message:
        "This will restore the template so it appears again in the library.",
      confirmLabel: "Recover",
      cancelLabel: "Cancel",
      onConfirm: () => {
        closeConfirm();
        void doRecover();
      },
    });
  };

  // Derived button/menu state for UI
  const quickReplyCount = (form.buttons || []).filter(
    (b) => b.type === "quick_reply"
  ).length;
  const hasWebsite = (form.buttons || []).some(
    (b) => b.type === "visit_website"
  );
  const hasCall = (form.buttons || []).some((b) => b.type === "call_phone");
  const hasCTA = hasWebsite || hasCall;

  const disableQuickReply =
    form.interactiveType !== "buttons" ||
    quickReplyCount >= MAX_QUICK_REPLIES ||
    hasCTA;
  const disableVisitWebsite =
    form.interactiveType !== "buttons" || hasWebsite || quickReplyCount > 0;
  const disableCallPhone =
    form.interactiveType !== "buttons" || hasCall || quickReplyCount > 0;

  const activeMenu =
    form.interactiveType === "menu" ? ensureMenu(form.menu) : null;
  const totalMenuOptions = activeMenu
    ? countTotalOptions(activeMenu.sections)
    : 0;
  const hasMenuOptions = totalMenuOptions > 0;
  const previewButtons = (form.buttons || []).slice(0, MAX_QUICK_REPLIES);

  // ------------------------------
  // UI: loading / error
  // ------------------------------

  if (!privLoading && !canView)
    return (
      <div className="p-6 text-center text-sm text-amber-700 border border-amber-200 bg-amber-50 rounded-lg">
        You do not have permission to view templates.
      </div>
    );

  if (loading)
    return <div className="p-6 text-center text-sm">Loading...</div>;
  if (error)
    return (
      <div className="p-6 text-center text-sm text-red-500">{error}</div>
    );

  // ------------------------------
  // Render
  // ------------------------------

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex justify-between">
        <div>
          <h1 className="text-lg font-semibold">Edit Template: {form.title}</h1>
          <p className="text-sm text-muted-foreground">
            Modify template metadata.
          </p>
        </div>

        <Link
          href="/content/templates"
          className="text-sm text-primary hover:underline"
        >
          Back to library
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* LEFT FORM */}
        <form
          id="edit-template-form"
          className="border rounded-xl p-6 space-y-6 bg-card"
        >
          {/* Title & Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm space-y-1">
              <span className="font-medium">Title</span>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>

            <label className="text-sm space-y-1">
              <span className="font-medium">Type</span>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: normalizeTemplateType(e.target.value) })
                }
              >
                <option value="message">Message</option>
                <option value="choice">Choice</option>
                <option value="input">Input</option>
                <option value="api">Api</option>
              </select>
            </label>
          </div>

          {/* Interaction type toggle */}
          <div className="border-t pt-4 space-y-2">
            <h4 className="text-sm font-semibold">Interaction Type</h4>
            <p className="text-xs text-muted-foreground">
              Choose between WhatsApp buttons (quick replies / CTA), a list-style menu, or no interaction.
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <label className="inline-flex items-center gap-2 border rounded px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="interactiveType"
                  className="h-4 w-4"
                  checked={form.interactiveType === "buttons"}
                  onChange={() => handleInteractiveTypeChange("buttons")}
                />
                Buttons (Quick Replies / Website / Call)
              </label>
              <label className="inline-flex items-center gap-2 border rounded px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="interactiveType"
                  className="h-4 w-4"
                  checked={form.interactiveType === "menu"}
                  onChange={() => handleInteractiveTypeChange("menu")}
                />
                Menu (List Message)
              </label>
              <label className="inline-flex items-center gap-2 border rounded px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="interactiveType"
                  className="h-4 w-4"
                  checked={form.interactiveType === "default"}
                  onChange={() => handleInteractiveTypeChange("default")}
                />
                Default (No interactions)
              </label>
            </div>
          </div>

          {/* Status + Language row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm space-y-1">
              <span className="font-medium">Status</span>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as string })
                }
              >
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </label>

            <label className="text-sm space-y-1">
              <span className="font-medium">Language</span>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.lang}
                onChange={(e) =>
                  setForm({ ...form, lang: e.target.value as string })
                }
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/*
            Category selection temporarily disabled, will be restored later.

          <div className="mt-4 text-sm">
            <span className="font-medium block mb-1">Category</span>
            <p className="text-xs text-muted-foreground mb-3">
              Choose what type of message this template is used for.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              {TEMPLATE_CATEGORY_OPTIONS.map((opt) => {
                const isSelected =
                  (form.category || "").toString().toLowerCase() ===
                  (opt.value || "").toString().toLowerCase();

                return (
                  <button
                    key={opt.value || opt.label}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        category: opt.value,
                      }))
                    }
                    className={[
                      "flex h-full flex-col items-start rounded-xl border bg-white px-3 py-3 text-left text-xs transition",
                      "hover:border-primary/60 hover:bg-primary/5",
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                        : "border-border",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-lg">
                        {opt.icon}
                      </span>
                      <span className="font-semibold text-sm">{opt.label}</span>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {opt.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          */}

          {/* EXPIRY */}
          <div className="border-t pt-4 space-y-2">
            <h4 className="text-sm font-semibold">Expiry</h4>
            <input
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={
                form.expiresat
                  ? new Date(form.expiresat).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                setForm({ ...form, expiresat: e.target.value })
              }
            />
          </div>

          {/* HEADER SECTION */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-semibold text-sm">
              Header{" "}
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm space-y-1">
                <span className="font-medium">Header Type</span>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={form.headerType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      headerType: e.target.value as "none" | "text" | "media",
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="text">Text</option>
                  <option value="media">Media</option>
                </select>
              </label>

              {form.headerType === "media" && (
                <label className="text-sm space-y-1">
                  <span className="font-medium">Media Type</span>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={form.headerMediaType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        headerMediaType: e.target.value as
                          | "image"
                          | "video"
                          | "document",
                      })
                    }
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </select>
                </label>
              )}
            </div>

            {form.headerType === "text" && (
              <label className="text-sm block space-y-1">
                <span className="font-medium">Header Text</span>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={form.headerText || ""}
                  onChange={(e) =>
                    setForm({ ...form, headerText: e.target.value })
                  }
                />
              </label>
            )}

            {form.headerType === "media" && (
              <label className="text-sm block space-y-1">
                <span className="font-medium">Header media URL</span>
                <input
                  type="url"
                  className="w-full border rounded px-3 py-2"
                  placeholder="https://example.com/image.jpg"
                  value={form.mediaurl || ""}
                  onChange={(e) =>
                    setForm({ ...form, mediaurl: e.target.value })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Provide a public URL to an image / media that will be rendered
                  above the message. Only URL is stored, no local file upload.
                </p>
              </label>
            )}
          </div>

          {/* BODY */}
          <label className="text-sm border-t pt-4 block space-y-1">
            <span className="font-medium">Body</span>
            <p className="text-xs text-muted-foreground">
              Formatting supported: **bold**, *italic*, ~~strikethrough~~, `code`.
            </p>
            <textarea
              className="w-full border rounded px-3 py-2 min-h-32"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>

          {/* FOOTER */}
          <div className="border-t pt-4 space-y-2">
            <h4 className="font-semibold text-sm">
              Footer{" "}
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </h4>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.footerText || ""}
              onChange={(e) =>
                setForm({ ...form, footerText: e.target.value })
              }
            />
          </div>

          {/* BUTTONS (interactiveType = buttons) */}
          {form.interactiveType === "buttons" && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">
                  Buttons{" "}
                  <span className="text-xs text-muted-foreground">(Optional)</span>
                </h4>
                <p className="text-xs text-muted-foreground">
                  Max 3 quick replies OR 1 website + 1 phone.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="border rounded px-3 py-1 disabled:opacity-60"
                  onClick={() => addButton("visit_website")}
                  disabled={disableVisitWebsite}
                >
                  + Add Visit Website
                </button>

                <button
                  type="button"
                  className="border rounded px-3 py-1 disabled:opacity-60"
                  onClick={() => addButton("call_phone")}
                  disabled={disableCallPhone}
                >
                  + Add Call Phone
                </button>

                <button
                  type="button"
                  className="border rounded px-3 py-1 disabled:opacity-60"
                  onClick={() => addButton("quick_reply")}
                  disabled={disableQuickReply}
                >
                  + Add Quick Reply
                </button>
              </div>

              {buttonError && (
                <p className="text-xs text-red-500">{buttonError}</p>
              )}

              {form.buttons?.length > 0 && (
                <div className="space-y-3">
                  {form.buttons.slice(0, MAX_QUICK_REPLIES).map((btn) => (
                    <div key={btn.id} className="border rounded p-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">
                          {btn.type === "visit_website"
                            ? "Visit Website"
                            : btn.type === "call_phone"
                            ? "Call Phone"
                            : "Quick Reply"}
                        </span>

                        <button
                          type="button"
                          className="text-red-500 text-xs"
                          onClick={() => removeButton(btn.id)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="text-xs space-y-1">
                          <span className="font-medium">Label</span>
                        <input
                          className="w-full border rounded px-2 py-1"
                          value={btn.label}
                          maxLength={BUTTON_LABEL_HARD_LIMIT}
                          onChange={(e) =>
                            updateButton(btn.id, { label: e.target.value })
                          }
                        />
                        <span className="text-[11px] text-muted-foreground">
                          Max {BUTTON_LABEL_SOFT_LIMIT} chars recommended (hard limit {BUTTON_LABEL_HARD_LIMIT}).
                        </span>
                      </label>

                        {btn.type === "visit_website" && (
                          <label className="col-span-1 md:col-span-2 text-xs space-y-1">
                            <span className="font-medium">URL</span>
                            <input
                              className="w-full border rounded px-2 py-1"
                              value={btn.url || ""}
                              onChange={(e) =>
                                updateButton(btn.id, { url: e.target.value })
                              }
                            />
                          </label>
                        )}

                        {btn.type === "call_phone" && (
                          <label className="col-span-1 md:col-span-2 text-xs space-y-1">
                            <span className="font-medium">Phone</span>
                            <input
                              className="w-full border rounded px-2 py-1"
                              value={btn.phone || ""}
                              onChange={(e) =>
                                updateButton(btn.id, { phone: e.target.value })
                              }
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MENU (interactiveType = menu) */}
          {form.interactiveType === "menu" && activeMenu && (
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm">Menu (List Message)</h4>
                  <p className="text-xs text-muted-foreground">
                    Buttons are disabled in menu mode. Total options: {totalMenuOptions}/{MAX_MENU_OPTIONS}.
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <label className="space-y-1 font-medium">
                  <span>Menu Button Label</span>
                  <input
                    type="text"
                    value={activeMenu.buttonLabel}
                    maxLength={MAX_MENU_BUTTON_LABEL}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        menu: {
                          ...ensureMenu(prev.menu),
                          buttonLabel: e.target.value.slice(
                            0,
                            MAX_MENU_BUTTON_LABEL
                          ),
                        },
                      }))
                    }
                    className="w-full border rounded px-3 py-2"
                    placeholder="Main Menu"
                  />
                  <span className="text-xs text-muted-foreground">
                    This is the label of the list opener button (max {MAX_MENU_BUTTON_LABEL} characters).
                  </span>
                  {menuError && !activeMenu.buttonLabel.trim() && (
                    <span className="text-[11px] text-red-500">
                      Menu button label is required.
                    </span>
                  )}
                </label>
              </div>

              {menuError && (
                <p className="text-xs text-red-500">{menuError}</p>
              )}

              <div className="space-y-3">
                {activeMenu.sections.map((section, sectionIdx) => (
                  <div key={section.id} className="border rounded p-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">Section {sectionIdx + 1}</span>
                        <p className="text-[11px] text-muted-foreground">
                          Optional section title. Add options below.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-red-500 disabled:opacity-60"
                        onClick={() => removeMenuSection(section.id)}
                        disabled={activeMenu.sections.length <= 1}
                      >
                        Remove Section
                      </button>
                    </div>

                    <label className="text-xs space-y-1 block">
                      <span className="font-medium">Section title (optional)</span>
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={section.title || ""}
                        maxLength={MAX_MENU_BUTTON_LABEL}
                        onChange={(e) =>
                          updateMenuSection(section.id, { title: e.target.value })
                        }
                        placeholder="Section title"
                      />
                    </label>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Options</span>
                      <button
                        type="button"
                        className="rounded-md border px-3 py-1 text-xs hover:bg-muted disabled:opacity-60"
                        onClick={() => addMenuOption(section.id)}
                        disabled={totalMenuOptions >= MAX_MENU_OPTIONS}
                      >
                        + Add Option
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      1-10 options across all sections.
                    </p>

                    <div className="space-y-3">
                      {section.options.length === 0 && (
                        <p className="text-[11px] text-muted-foreground border rounded p-2">
                          No options in this section yet. Add your first row.
                        </p>
                      )}
                      {section.options.map((opt, idx) => (
                        <div key={opt.id} className="border rounded p-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Option {idx + 1}</span>
                            <button
                              type="button"
                              className="text-xs text-red-500"
                              onClick={() => removeMenuOption(section.id, opt.id)}
                            >
                              Remove Option
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="text-xs space-y-1">
                              <span className="font-medium">Title</span>
                              <input
                                className="w-full border rounded px-2 py-1"
                                value={opt.title}
                                maxLength={MAX_MENU_OPTION_TITLE}
                                onChange={(e) =>
                                  updateMenuOption(section.id, opt.id, {
                                    title: e.target.value,
                                  })
                                }
                                placeholder="Option title"
                              />
                              {menuError && !opt.title.trim() && (
                                <span className="text-[11px] text-red-500">
                                  Title is required.
                                </span>
                              )}
                            </label>

                            <label className="text-xs space-y-1">
                              <span className="font-medium">Description (optional)</span>
                              <input
                                className="w-full border rounded px-2 py-1"
                                value={opt.description || ""}
                                maxLength={MAX_MENU_OPTION_DESC}
                                onChange={(e) =>
                                  updateMenuOption(section.id, opt.id, {
                                    description: e.target.value,
                                  })
                                }
                                placeholder="Short description"
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                  onClick={addMenuSection}
                >
                  + Add Section
                </button>
              </div>
            </div>
          )}
        </form>

        {/* RIGHT PANEL */}
        <aside className="space-y-4">
          {/* Actions */}
          <div className="p-4 border rounded-xl space-y-3 bg-card">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-semibold">Actions</h4>
              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                {form.status}
              </span>
            </div>

            <button
              type="button"
              className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
              disabled={saving}
              onClick={handleSaveClick}
            >
              {saving
                ? "Saving..."
                : form.isdeleted
                ? "Save Changes"
                : "Save Template"}
            </button>

            <button
              type="button"
              className="w-full border rounded px-4 py-2 text-sm text-muted-foreground"
              onClick={handleCancelClick}
            >
              Cancel
            </button>

            {/* Archive button (soft delete) */}
            <button
              type="button"
              className={`w-full border rounded px-4 py-2 text-sm ${
                form.isdeleted
                  ? "border-red-600 text-red-600"
                  : "border-red-500 text-red-500"
              } ${saving ? "opacity-70 cursor-not-allowed" : ""}`}
              onClick={handleDeleteClick}
              disabled={saving}
            >
              {form.isdeleted ? "Delete Template" : "Archive Template"}
            </button>

            {/* Recover button – only when archived */}
            {form.isdeleted && (
              <button
                type="button"
                className="w-full border border-emerald-500 text-emerald-600 rounded px-4 py-2 text-sm"
                onClick={handleRecoverClick}
              >
                Recover Template
              </button>
            )}
          </div>

          {/* WhatsApp Preview */}
          <div className="p-4 border rounded-xl bg-card space-y-3">
            <h4 className="text-sm font-semibold">Template Preview</h4>
            <p className="text-xs text-muted-foreground">
              Preview of how this saved message block may look when sent as a normal WhatsApp session message.
            </p>

            <div className="mx-auto max-w-xs rounded-2xl border bg-muted p-3">
              {form.headerType === "media" && form.mediaurl && (
                <img
                  src={form.mediaurl}
                  className="rounded w-full object-cover max-h-40 mb-2"
                  alt="Header media"
                />
              )}

              {form.headerType === "text" && form.headerText && (
                <p className="text-xs font-semibold mb-1">
                  {form.headerText}
                </p>
              )}

              <div className="bg-background rounded p-2 text-xs shadow">
                {renderFormattedLines(form.body, " ")}
              </div>

              {form.interactiveType === "buttons" && previewButtons.length > 0 && (
                <div className="border-t mt-2 pt-2 space-y-1">
                  {previewButtons.map((btn) => (
                    <button
                      key={btn.id}
                      className="w-full rounded-full border px-3 py-1.5 text-[11px] text-primary"
                      type="button"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}

              {form.interactiveType === "menu" && activeMenu && (
                <div className="border-t mt-2 pt-2 space-y-1">
                  <button
                    type="button"
                    className="w-full rounded-full border px-3 py-1.5 text-[11px] text-primary"
                  >
                    {activeMenu.buttonLabel || "Main Menu"}
                  </button>
                </div>
              )}
            </div>

            {form.interactiveType === "menu" && activeMenu && hasMenuOptions && (
              <div className="border rounded-lg bg-muted/40 p-3 space-y-2 text-[11px]">
                {activeMenu.sections.map((section, sectionIdx) => (
                  <div
                    key={section.id}
                    className="border-b last:border-b-0 border-slate-200/80 pb-2 last:pb-0 space-y-1"
                  >
                    <div className="font-semibold text-[10px] uppercase tracking-wide text-slate-700">
                      {(section.title || "").trim() || `Section ${sectionIdx + 1}`}
                    </div>
                    {section.options.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground">
                        No options in this section.
                      </div>
                    ) : (
                      section.options.map((opt, optIdx) => {
                        const title = opt.title?.trim() || `Option ${optIdx + 1}`;
                        const desc = opt.description?.trim();
                        return (
                          <div key={opt.id} className="flex items-start gap-2">
                            <span>-</span>
                            <span>
                              {title}
                              {desc ? ` - ${desc}` : ""}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Visual preview of how your template appears in WhatsApp.
            </p>
          </div>
        </aside>
      </div>

      {/* Confirm Modal */}
      {confirm.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-card p-4 shadow-lg">
            <h3 className="text-sm font-semibold mb-2">{confirm.title}</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {confirm.message}
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                className="px-3 py-1 rounded border"
                onClick={closeConfirm}
              >
                {confirm.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded bg-primary text-primary-foreground"
                onClick={() => confirm.onConfirm && confirm.onConfirm()}
              >
                {confirm.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedback.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-card p-4 shadow-lg">
            <h3 className="text-sm font-semibold mb-2">{feedback.title}</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {feedback.message}
            </p>
            <div className="flex justify-end gap-2 text-xs">
              {feedback.secondaryLabel && (
                <button
                  type="button"
                  className="px-3 py-1 rounded border"
                  onClick={() =>
                    feedback.onSecondary
                      ? feedback.onSecondary()
                      : closeFeedback()
                  }
                >
                  {feedback.secondaryLabel}
                </button>
              )}
              <button
                type="button"
                className="px-3 py-1 rounded bg-primary text-primary-foreground"
                onClick={() =>
                  feedback.onPrimary ? feedback.onPrimary() : closeFeedback()
                }
              >
                {feedback.primaryLabel || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




