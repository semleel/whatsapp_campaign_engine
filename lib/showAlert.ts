"use client";

/**
 * Render a lightweight modal alert box centered on the viewport.
 * Returns a promise that resolves after the user dismisses the alert.
 */
export function showCenteredAlert(message: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    // Remove an existing alert instance if present
    const existing = document.getElementById("app-centered-alert");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "app-centered-alert";
    overlay.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4";

    const box = document.createElement("div");
    box.className =
      "w-full max-w-md rounded-2xl border border-border bg-gradient-to-br from-card to-muted/70 p-6 shadow-2xl text-foreground animate-[fadeIn_150ms_ease-out]";

    const iconWrap = document.createElement("div");
    iconWrap.className =
      "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner";
    iconWrap.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8a8.009 8.009 0 0 1-8 8Zm0-12a1.25 1.25 0 1 0-1.25-1.25A1.25 1.25 0 0 0 12 8Zm0 2a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1Z" />
      </svg>
    `;

    const titleEl = document.createElement("div");
    titleEl.className = "text-base font-semibold text-foreground text-center mb-1";
    titleEl.textContent = "Heads up";

    const messageEl = document.createElement("p");
    messageEl.className = "text-sm text-muted-foreground text-center leading-relaxed";
    messageEl.textContent = message;

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
    button.textContent = "OK";

    const close = () => {
      overlay.remove();
      resolve();
    };

    button.addEventListener("click", close);
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") close();
      },
      { once: true }
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    box.appendChild(iconWrap);
    box.appendChild(titleEl);
    box.appendChild(messageEl);
    box.appendChild(button);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Focus the button for quick keyboard dismissal
    button.focus();
  });
}

/**
 * Permission-specific alert with consistent wording and styling.
 * Use when a user attempts an action they are not allowed to perform.
 */
export function showPrivilegeDenied(opts: { action?: string; resource?: string; message?: string } | string): Promise<void> {
  const normalized =
    typeof opts === "string"
      ? { message: opts }
      : {
          action: opts.action,
          resource: opts.resource,
          message: opts.message,
        };

  const actionText = normalized.action || "perform this action";
  const resourceText = normalized.resource ? ` on ${normalized.resource}` : "";
  const body =
    normalized.message ||
    `You need permission to ${actionText}${resourceText}. Please contact an admin or request access.`;

  if (typeof window === "undefined") return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.getElementById("app-privilege-alert");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "app-privilege-alert";
    overlay.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4";

    const box = document.createElement("div");
    box.className =
      "w-full max-w-md rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-6 shadow-2xl text-foreground animate-[fadeIn_150ms_ease-out]";

    const iconWrap = document.createElement("div");
    iconWrap.className =
      "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-inner";
    iconWrap.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8a8.009 8.009 0 0 1-8 8Zm0-12a1.25 1.25 0 1 0-1.25-1.25A1.25 1.25 0 0 0 12 8Zm0 2a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1Z" />
      </svg>
    `;

    const titleEl = document.createElement("div");
    titleEl.className = "text-base font-semibold text-center mb-1 text-amber-700";
    titleEl.textContent = "Permission required";

    const messageEl = document.createElement("p");
    messageEl.className = "text-sm text-muted-foreground text-center leading-relaxed";
    messageEl.textContent = body;

    const hintEl = document.createElement("p");
    hintEl.className = "mt-2 text-xs text-amber-700/80 text-center";
    hintEl.textContent = "If this is unexpected, ask your admin to grant access in System > Staff.";

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "mt-5 inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:opacity-90 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500";
    button.textContent = "OK";

    const close = () => {
      overlay.remove();
      resolve();
    };

    button.addEventListener("click", close);
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") close();
      },
      { once: true }
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    box.appendChild(iconWrap);
    box.appendChild(titleEl);
    box.appendChild(messageEl);
    box.appendChild(hintEl);
    box.appendChild(button);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    button.focus();
  });
}

/**
 * Render a centered confirm box with OK/Cancel.
 * Resolves to true when confirmed, false when dismissed.
 */
export function showCenteredConfirm(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const existing = document.getElementById("app-centered-confirm");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "app-centered-confirm";
    overlay.className =
      "fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4";

    const box = document.createElement("div");
    box.className =
      "w-full max-w-md rounded-2xl border border-border bg-gradient-to-br from-card to-muted/70 p-6 shadow-2xl text-foreground animate-[fadeIn_150ms_ease-out]";

    const iconWrap = document.createElement("div");
    iconWrap.className =
      "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner";
    iconWrap.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8a8.009 8.009 0 0 1-8 8Zm0-12a1.25 1.25 0 1 0-1.25-1.25A1.25 1.25 0 0 0 12 8Zm0 2a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1Z" />
      </svg>
    `;

    const titleEl = document.createElement("div");
    titleEl.className = "text-base font-semibold text-foreground text-center mb-1";
    titleEl.textContent = "Please confirm";

    const messageEl = document.createElement("p");
    messageEl.className = "text-sm text-muted-foreground text-center leading-relaxed";
    messageEl.textContent = message;

    const buttonRow = document.createElement("div");
    buttonRow.className = "mt-5 grid grid-cols-2 gap-2";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className =
      "inline-flex w-full items-center justify-center rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/80 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
    cancelBtn.textContent = "Cancel";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className =
      "inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
    okBtn.textContent = "Confirm";

    const cleanup = () => overlay.remove();

    const confirmAction = () => {
      cleanup();
      resolve(true);
    };

    const cancelAction = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener("click", confirmAction);
    cancelBtn.addEventListener("click", cancelAction);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cancelAction();
    });
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") cancelAction();
        if (e.key === "Enter") confirmAction();
      },
      { once: true }
    );

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(okBtn);
    box.appendChild(iconWrap);
    box.appendChild(titleEl);
    box.appendChild(messageEl);
    box.appendChild(buttonRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    okBtn.focus();
  });
}

const TOAST_CONTAINER_ID = "app-toast-container";

export function showSuccessToast(message: string) {
  if (typeof window === "undefined") return;

  let container = document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = TOAST_CONTAINER_ID;
    container.className = "fixed inset-0 flex pointer-events-none items-start justify-end p-4";
    container.style.zIndex = "9999";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className =
    "mb-2 w-full max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900 shadow-lg transition-all duration-200 opacity-0";
  toast.style.pointerEvents = "auto";
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("opacity-100");
  });

  const remove = () => {
    toast.classList.remove("opacity-100");
    toast.classList.add("opacity-0");
    setTimeout(() => {
      toast.remove();
      if (container && container.childElementCount === 0) {
        container.remove();
      }
    }, 200);
  };

  toast.addEventListener("click", remove);
  setTimeout(remove, 3500);
}
