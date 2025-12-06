"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showCenteredAlert } from "@/lib/showAlert";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import TagSelector from "../../../../components/TagSelector";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

const SUPPORTED_LOCALES = [
  { value: "en", label: "English" },
  { value: "my", label: "Bahasa Melayu" },
  { value: "cn", label: "Chinese" },
];

type ButtonType = "visit_website" | "call_phone" | "quick_reply";

type TemplateButton = {
  id: string;
  type: ButtonType;
  label: string;
  url?: string;
  phone?: string;
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

// Template category type + options (WANotifier-style)
type TemplateCategory =
  | "Marketing"
  | "Utility"
  | "Authentication"
  | string
  | null;

type TemplateActionType = "choice" | "message" | "input" | "api";

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

type TemplateForm = {
  title: string;
  type: TemplateActionType;
  category: TemplateCategory;
  status: string;
  lang: string;
  body: string;
  description: string;
  mediaurl: string; // URL only
  tags: string[];
  expiresat: string;

  headerType: "none" | "text" | "media";
  headerMediaType: "image" | "video" | "document";
  headerText: string;
  buttons: TemplateButton[];
  interactiveType: TemplateInteractiveType;
  menu: TemplateMenu | null;
};

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

function createEmptyMenu(): TemplateMenu {
  return {
    buttonLabel: "Main Menu",
    sections: [
      {
        id: generateId(),
        title: "",
        options: [
          {
            id: generateId(),
            title: "Option 1",
            description: "",
          },
        ],
      },
    ],
  };
}

function validateButtons(buttons: TemplateButton[]): string | null {
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

function validateMenu(menu: TemplateMenu | null): string | null {
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

// Initial form factory so we can reuse it
function createEmptyForm(): TemplateForm {
  return {
    title: "",
    type: "message",
    category: "Marketing", // default selection
    status: "Active",
    lang: "en",
    body: "",
    description: "",
    mediaurl: "",
    tags: [],
    expiresat: "",
    headerType: "none",
    headerMediaType: "image",
    headerText: "",
    buttons: [],
    interactiveType: "default",
    menu: null,
  };
}

export default function ContentCreatePage() {
  const router = useRouter();
  const { canCreate, loading: privLoading } = usePrivilege("content");

  const [form, setForm] = useState<TemplateForm>(() => createEmptyForm());
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [buttonError, setButtonError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // -----------------------------
  // Buttons helpers
  // -----------------------------
  const addButton = (type: ButtonType) => {
    setButtonError(null);
    setMenuError(null);
    setForm((prev) => ({
      ...prev,
      interactiveType: "buttons",
    }));

    setForm((prev) => {
      const quickReplies = prev.buttons.filter((b) => b.type === "quick_reply");
      const websiteButtons = prev.buttons.filter((b) => b.type === "visit_website");
      const callButtons = prev.buttons.filter((b) => b.type === "call_phone");
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

      const nextButton: TemplateButton = {
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
        buttons: [...prev.buttons, nextButton],
      };
    });
  };

  const updateButton = (id: string, changes: Partial<TemplateButton>) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.map((b) =>
        b.id === id
          ? {
              ...b,
              ...changes,
              label:
                changes.label !== undefined
                  ? changes.label.slice(0, BUTTON_LABEL_HARD_LIMIT)
                  : b.label,
            }
          : b
      ),
    }));
  };

  const removeButton = (id: string) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((b) => b.id !== id),
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

  // -----------------------------
  // Menu helpers
  // -----------------------------
  const ensureMenu = (existing: TemplateMenu | null | undefined): TemplateMenu => {
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

    let sections = normalizeSections(existing?.sections);

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
      return createEmptyMenu();
    }

    return {
      buttonLabel:
        (existing?.buttonLabel || "Main Menu").slice(0, MAX_MENU_BUTTON_LABEL) ||
        "Main Menu",
      sections,
    };
  };

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

  // -----------------------------
  // Submit
  // -----------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      setMessage("You do not have permission to create templates.");
      return;
    }
    setSubmitting(true);
    setButtonError(null);
    setMenuError(null);

    try {
      if (form.interactiveType === "buttons") {
        const err = validateButtons(form.buttons);
        if (err) {
          setButtonError(err);
          setMessage(err === BUTTON_CONFIG_ERROR ? BUTTON_CONFIG_ERROR : err);
          setSubmitting(false);
          return;
        }
      } else if (form.interactiveType === "menu") {
        const menuToValidate = ensureMenu(form.menu);
        const err = validateMenu(menuToValidate);
        if (err) {
          setMenuError(err);
          setMessage(MENU_CONFIG_ERROR);
          setSubmitting(false);
          return;
        }
      }

      const expiresAtIso = form.expiresat
        ? new Date(form.expiresat).toISOString()
        : null;

      const apiInteractiveType =
        form.interactiveType === "default" ? undefined : form.interactiveType;

      const placeholderData = {
        headerText: form.headerType === "text" ? form.headerText : null,
        headerType: form.headerType,
        headerMediaType:
          form.headerType === "media" ? form.headerMediaType : null,
        buttons: form.buttons,
        interactiveType: apiInteractiveType,
      };

      const payload = {
        ...form,
        category: form.category || null,
        status: form.status,
        lang: form.lang,
        defaultLang: form.lang, 
        body: form.body,
        description: form.description || form.body || null,
        mediaUrl: form.mediaurl?.trim() || null,
        expiresat: expiresAtIso,
        headerText: placeholderData.headerText,
        headerType: placeholderData.headerType,
        headerMediaType: placeholderData.headerMediaType,
        buttons: form.interactiveType === "buttons" ? placeholderData.buttons : [],
        menu: form.interactiveType === "menu" ? ensureMenu(form.menu) : null,
        interactiveType: apiInteractiveType,
        placeholders: {
          ...placeholderData,
          menu: form.interactiveType === "menu" ? ensureMenu(form.menu) : undefined,
        },
      };

      // 1) Create main template record via shared Api client
      const createdResponse = await Api.createTemplate(payload);
      const created = (createdResponse as any)?.data;
      const contentId: number | undefined = created?.contentid;

      // 2) Attach tags (join table)
      const tags = form.tags;
      if (contentId && tags.length) {
        // Make sure these helpers exist in client.ts:
        // attachTags(templateId: number, tags: string[])
        await (Api as any).attachTags(contentId, tags);
      }

      // 3) Expiry – dedicated endpoint
      if (contentId && form.expiresat) {
        const iso = new Date(form.expiresat).toISOString();
        // Make sure this helper exists in client.ts:
        // setTemplateExpiry(templateId: number, expiresAt: string)
        await (Api as any).setTemplateExpiry(contentId, iso);
      }

      // reset form (not really visible since we redirect, but safe)
      setForm(createEmptyForm());
      setMessage(null);

      // Single success popup, then go back to template library
      await showCenteredAlert("Template created successfully!");
      router.push("/content/templates");
    } catch (err: any) {
      console.error(err);
      await showCenteredAlert(
        err?.message || "Network error."
      );
      setMessage(err?.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const previewBody = form.body.trim() || "Body text here";

  const quickReplyCount = form.buttons.filter((b) => b.type === "quick_reply").length;
  const hasWebsite = form.buttons.some((b) => b.type === "visit_website");
  const hasCall = form.buttons.some((b) => b.type === "call_phone");
  const hasCTA = hasWebsite || hasCall;

  const disableQuickReply =
    form.interactiveType !== "buttons" ||
    quickReplyCount >= MAX_QUICK_REPLIES ||
    hasCTA;
  const disableVisitWebsite =
    form.interactiveType !== "buttons" ||
    hasWebsite ||
    quickReplyCount > 0;
  const disableCallPhone =
    form.interactiveType !== "buttons" ||
    hasCall ||
    quickReplyCount > 0;

  const activeMenu = form.interactiveType === "menu" ? ensureMenu(form.menu) : null;
  const totalMenuOptions = activeMenu ? countTotalOptions(activeMenu.sections) : 0;
  const hasMenuOptions = totalMenuOptions > 0;
  const previewButtons = form.buttons.slice(0, MAX_QUICK_REPLIES);

  const permissionBanner =
    !privLoading && !canCreate ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to create templates.
      </div>
    ) : null;

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Create Template</h3>
          <p className="text-sm text-muted-foreground">
            Add a new WhatsApp-approved message, tag it with metadata, and
            keep the versioning trail clean.
          </p>
        </div>
        <Link
          href="/content/templates"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to library
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start">
        {/* LEFT: form */}
        <form
          id="template-form"
          onSubmit={handleSubmit}
          className="rounded-xl border bg-card p-6 space-y-6"
        >
          {/* Basic info */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>Title</span>
              <input
                type="text"
                name="title"
                placeholder="e.g. Welcome Back"
                value={form.title}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Type</span>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="message">Message</option>
                <option value="choice">Choice</option>
                <option value="input">Input</option>
                <option value="api">Api</option>
              </select>
            </label>
          </div>

          {/* Status + language */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>Status</span>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Language</span>
              <select
                name="lang"
                value={form.lang}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
                required
              >
                {SUPPORTED_LOCALES.map((locale) => (
                  <option key={locale.value} value={locale.value}>
                    {locale.label} ({locale.value.toUpperCase()})
                  </option>
                ))}
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
                      <span className="font-semibold text-sm">
                        {opt.label}
                      </span>
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

          {/* TAGS – Wati-style picker */}
          <div className="border-t pt-4 space-y-2">
            <h4 className="font-semibold text-sm">Tags</h4>
            <p className="text-xs text-muted-foreground">
              Use tags to group similar templates. Start typing to search and
              select from your existing tags.
            </p>

            <TagSelector
              selected={form.tags}
              onChange={(tags: string[]) =>
                setForm((prev) => ({
                  ...prev,
                  tags,
                }))
              }
            />
          </div>

          {/* EXPIRY */}
          <div className="border-t pt-4 space-y-2">
            <h4 className="font-semibold text-sm">Expiry</h4>
            <input
              type="datetime-local"
              name="expiresat"
              value={form.expiresat}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              Optional. Auto-hides after this time.
            </span>
          </div>

          {/* Header (text/media config) */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">
              Header{" "}
              <span className="text-xs text-muted-foreground">
                (Optional)
              </span>
            </h4>
            <p className="text-xs text-muted-foreground">
              Add a title or media URL that you want to show in the message
              header.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                <span>Header type</span>
                <select
                  name="headerType"
                  value={form.headerType}
                  onChange={handleChange}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="none">None</option>
                  <option value="text">Text</option>
                  <option value="media">Media</option>
                </select>
              </label>

              {form.headerType === "media" && (
                <label className="space-y-1 text-sm font-medium">
                  <span>Media type</span>
                  <select
                    name="headerMediaType"
                    value={form.headerMediaType}
                    onChange={handleChange}
                    className="w-full rounded-md border px-3 py-2"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </select>
                </label>
              )}

              {form.headerType === "text" && (
                <label className="space-y-1 text-sm font-medium md:col-span-2">
                  <span>Header text</span>
                  <input
                    type="text"
                    name="headerText"
                    placeholder="Add a short title"
                    value={form.headerText}
                    onChange={handleChange}
                    className="w-full rounded-md border px-3 py-2"
                  />
                </label>
              )}
            </div>

            {/* Media URL input (URL only, no file upload) */}
            {form.headerType === "media" && (
              <div className="space-y-1 text-sm font-medium">
                <span>Header media URL</span>
                <input
                  type="text"
                  name="mediaurl"
                  placeholder="https://example.com/image.jpg"
                  value={form.mediaurl}
                  onChange={handleChange}
                  className="w-full rounded-md border px-3 py-2"
                />
                <p className="text-xs text-muted-foreground">
                  Provide a public URL for an image / media shown above the
                  message. Only URL is stored, no local file upload.
                </p>
              </div>
            )}
          </div>

          {/* Body */}
          <label className="space-y-1 text-sm font-medium block border-t pt-4">
            <span>Body</span>
            <p className="text-xs text-muted-foreground">
              Formatting supported: **bold**, *italic*, ~~strikethrough~~, `code`.
            </p>
            <textarea
              name="body"
              placeholder="Message body and personalization notes"
              value={form.body}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 min-h-32"
            />
          </label>

          {/* Buttons (only when interactiveType = buttons) */}
          {form.interactiveType === "buttons" && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  Buttons{" "}
                  <span className="text-xs text-muted-foreground">
                    (Optional)
                  </span>
                </h4>
                <p className="text-xs text-muted-foreground">
                  Max 3 quick replies OR 1 website + 1 phone.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => addButton("visit_website")}
                  className="rounded-md border px-3 py-1 hover:bg-muted disabled:opacity-60"
                  disabled={disableVisitWebsite}
                >
                  + Add Visit Website
                </button>
                <button
                  type="button"
                  onClick={() => addButton("call_phone")}
                  className="rounded-md border px-3 py-1 hover:bg-muted disabled:opacity-60"
                  disabled={disableCallPhone}
                >
                  + Add Call Phone
                </button>
                <button
                  type="button"
                  onClick={() => addButton("quick_reply")}
                  className="rounded-md border px-3 py-1 hover:bg-muted disabled:opacity-60"
                  disabled={disableQuickReply}
                >
                  + Add Quick Reply
                </button>
              </div>

              {buttonError && (
                <p className="text-xs text-red-500">{buttonError}</p>
              )}

              {form.buttons.length > 0 && (
                <div className="space-y-3">
                  {form.buttons.slice(0, MAX_QUICK_REPLIES).map((btn) => (
                    <div
                      key={btn.id}
                      className="rounded-md border p-3 space-y-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {btn.type === "visit_website"
                            ? "Call to Action - Visit website"
                            : btn.type === "call_phone"
                            ? "Call to Action - Call phone"
                            : "Quick reply"}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-red-500"
                          onClick={() => removeButton(btn.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="space-y-1 text-xs font-medium">
                          <span>Button text</span>
                          <input
                            type="text"
                            value={btn.label}
                            maxLength={BUTTON_LABEL_HARD_LIMIT}
                            onChange={(e) =>
                              updateButton(btn.id, {
                                label: e.target.value,
                              })
                            }
                            className="w-full rounded-md border px-2 py-1"
                          />
                          <span className="text-[11px] text-muted-foreground">
                            Max {BUTTON_LABEL_SOFT_LIMIT} chars recommended (hard limit {BUTTON_LABEL_HARD_LIMIT}).
                          </span>
                        </label>
                        {btn.type === "visit_website" && (
                          <label className="space-y-1 text-xs font-medium md:col-span-2">
                            <span>Website URL</span>
                            <input
                              type="text"
                              value={btn.url || ""}
                              onChange={(e) =>
                                updateButton(btn.id, {
                                  url: e.target.value,
                                })
                              }
                              className="w-full rounded-md border px-2 py-1"
                              placeholder="https://example.com"
                            />
                          </label>
                        )}
                        {btn.type === "call_phone" && (
                          <label className="space-y-1 text-xs font-medium md:col-span-2">
                            <span>Phone number</span>
                            <input
                              type="text"
                              value={btn.phone || ""}
                              onChange={(e) =>
                                updateButton(btn.id, {
                                  phone: e.target.value,
                                })
                              }
                              className="w-full rounded-md border px-2 py-1"
                              placeholder="+60..."
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

          {/* Menu (only when interactiveType = menu) */}
          {form.interactiveType === "menu" && activeMenu && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Menu (List Message)</h4>
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
                    className="w-full rounded-md border px-3 py-2"
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
                  <div
                    key={section.id}
                    className="rounded-md border p-3 space-y-3 text-sm"
                  >
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

                    <label className="space-y-1 text-xs font-medium block">
                      <span>Section title (optional)</span>
                      <input
                        type="text"
                        value={section.title || ""}
                        maxLength={MAX_MENU_BUTTON_LABEL}
                        onChange={(e) =>
                          updateMenuSection(section.id, { title: e.target.value })
                        }
                        className="w-full rounded-md border px-2 py-1"
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
                        <div
                          key={opt.id}
                          className="rounded border p-3 space-y-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              Option {idx + 1}
                            </span>
                            <button
                              type="button"
                              className="text-xs text-red-500"
                              onClick={() => removeMenuOption(section.id, opt.id)}
                            >
                              Remove Option
                            </button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-1 text-xs font-medium">
                              <span>Title</span>
                              <input
                                type="text"
                                value={opt.title}
                                maxLength={MAX_MENU_OPTION_TITLE}
                                onChange={(e) =>
                                  updateMenuOption(section.id, opt.id, {
                                    title: e.target.value,
                                  })
                                }
                                className="w-full rounded-md border px-2 py-1"
                                placeholder="Option title"
                              />
                              {menuError && !opt.title.trim() && (
                                <span className="text-[11px] text-red-500">
                                  Title is required.
                                </span>
                              )}
                            </label>
                            <label className="space-y-1 text-xs font-medium">
                              <span>Description (optional)</span>
                              <input
                                type="text"
                                value={opt.description || ""}
                                maxLength={MAX_MENU_OPTION_DESC}
                                onChange={(e) =>
                                  updateMenuOption(section.id, opt.id, {
                                    description: e.target.value,
                                  })
                                }
                                className="w-full rounded-md border px-2 py-1"
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

        {/* RIGHT: Actions + Preview */}
        <aside className="space-y-4">
          {/* Actions card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Actions</h4>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {form.status || "Active"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Save this template for your FYP demonstration.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                form="template-form"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save template"}
              </button>
              <Link
                href="/content/templates"
                className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/60"
              >
                Cancel
              </Link>
            </div>
          </div>

          {/* Preview card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold">Template Preview</h4>
            <div className="mx-auto max-w-xs rounded-2xl border bg-muted p-3">
              {/* header media preview (URL-based) */}
              {form.headerType === "media" && form.mediaurl.trim() && (
                <div className="mb-2 overflow-hidden rounded-md bg-background">
                  <img
                    src={form.mediaurl.trim()}
                    alt="Header preview"
                    className="block w-full object-cover max-h-40"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </div>
              )}

              {/* header text preview */}
              {form.headerType === "text" && form.headerText.trim() && (
                <p className="mb-1 text-xs font-semibold">
                  {form.headerText}
                </p>
              )}

              {/* body bubble */}
              <div className="rounded-lg bg-background px-3 py-2 text-xs leading-relaxed shadow-sm">
                {renderFormattedLines(previewBody, "Body text here")}
              </div>

              {/* buttons */}
              {form.interactiveType === "buttons" && previewButtons.length > 0 && (
                <div className="mt-2 border-t pt-2 space-y-1">
                  {previewButtons.map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      className="w-full rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-primary text-center"
                    >
                      {btn.label || "Button"}
                    </button>
                  ))}
                </div>
              )}

              {form.interactiveType === "menu" && activeMenu && (
                <div className="mt-2 border-t pt-2 space-y-1">
                  <button
                    type="button"
                    className="w-full rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-primary text-center"
                  >
                    {activeMenu.buttonLabel || "Main Menu"}
                  </button>
                </div>
              )}
            </div>

            {form.interactiveType === "menu" && activeMenu && hasMenuOptions && (
              <div className="rounded-md border bg-muted/30 p-3 text-[11px] space-y-2">
                {activeMenu.sections.map((section, sectionIdx) => (
                  <div
                    key={section.id}
                    className="space-y-1 border-b last:border-b-0 border-slate-200/70 pb-2 last:pb-0"
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
              This preview is static for UI demonstration in your FYP.
              Actual WhatsApp rendering may differ slightly.
            </p>
          </div>
        </aside>
      </div>

      {message && (
        <p className="text-sm text-red-500">{message}</p>
      )}
    </div>
  );
}

