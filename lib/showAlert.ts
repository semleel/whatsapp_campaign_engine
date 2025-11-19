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
