const NOTICE_TIMEOUT_MS = 4200;
let noticeTimerId = 0;

export function buildAuthViewModel(session) {
  if (session?.authenticated && session.user?.accountName) {
    return {
      loginLabel: "退出登录",
      authAction: "logout"
    };
  }

  return {
    loginLabel: "登录 / 注册",
    authAction: "login"
  };
}

export function buildAuthNotice(message, type = "info") {
  return {
    message,
    type,
    visible: Boolean(message),
    timeoutMs: message ? NOTICE_TIMEOUT_MS : 0
  };
}

function applyVisibility(nodes, isVisible) {
  nodes.forEach((node) => {
    node.hidden = !isVisible;
    if (isVisible) {
      node.removeAttribute("hidden");
      node.classList.remove("is-auth-hidden");
    } else {
      node.setAttribute("hidden", "hidden");
      node.classList.add("is-auth-hidden");
    }
    node.setAttribute("aria-hidden", String(!isVisible));
  });
}

function getApiBase() {
  const meta = document.querySelector('meta[name="ace-auth-api-base"]');
  const configured = meta?.content?.trim() ?? "";

  if (configured) {
    const isLocalPage = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const pointsToLocalAuth = configured.includes("localhost") || configured.includes("127.0.0.1");
    if (!isLocalPage && pointsToLocalAuth) {
      return "";
    }
    return configured;
  }

  return "";
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${getApiBase()}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Request failed with ${response.status}`);
    error.code = payload?.error?.code || "AUTH_SERVICE_UNAVAILABLE";
    throw error;
  }

  return payload;
}

function byId(id) {
  return document.getElementById(id);
}

function ensureToastRoot() {
  let root = byId("authToastRoot");
  if (root) {
    return root;
  }

  root = document.createElement("div");
  root.id = "authToastRoot";
  root.className = "auth-toast-root";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");
  root.hidden = true;
  document.body.appendChild(root);
  return root;
}

function clearNoticeTimer() {
  if (!noticeTimerId) {
    return;
  }

  window.clearTimeout(noticeTimerId);
  noticeTimerId = 0;
}

function renderToast(notice) {
  if (typeof document === "undefined" || !document.body) {
    return;
  }

  const root = ensureToastRoot();
  clearNoticeTimer();
  root.replaceChildren();
  root.hidden = !notice.visible;

  if (!notice.visible) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "auth-toast";
  toast.dataset.type = notice.type;
  toast.setAttribute("role", notice.type === "error" ? "alert" : "status");
  toast.textContent = notice.message;
  root.appendChild(toast);
  toast.classList.add("is-visible");

  noticeTimerId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => {
      if (root.contains(toast)) {
        root.removeChild(toast);
      }
      root.hidden = true;
    }, 180);
    noticeTimerId = 0;
  }, notice.timeoutMs);
}

function setMessage(message, type = "info") {
  const notice = buildAuthNotice(message, type);
  const status = byId("authStatus");

  if (status) {
    status.textContent = notice.message;
    status.dataset.type = notice.type;
    status.hidden = !notice.visible;
  }

  renderToast(notice);
}

function openAuthModal(view) {
  byId("authModal").hidden = false;
  document.body.classList.add("auth-modal-open");
  switchView(view);
}

function closeAuthModal() {
  byId("authModal").hidden = true;
  document.body.classList.remove("auth-modal-open");
  setMessage("");
}

function switchView(view) {
  const panels = document.querySelectorAll("[data-auth-view]");
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.authView !== view;
  });
  setMessage("");
}

function serializeForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function refreshSessionUi() {
  const authButtons = document.querySelectorAll("[data-auth-cta]");

  try {
    const session = await apiFetch("/auth/me");
    const model = buildAuthViewModel(session);
    applyVisibility(authButtons, true);
    authButtons.forEach((button) => {
      button.textContent = model.loginLabel;
      button.dataset.authAction = model.authAction;
      button.dataset.guest = model.authAction === "login" ? "true" : "false";
    });
  } catch {
    const fallbackModel = buildAuthViewModel({ authenticated: false, user: null });
    applyVisibility(authButtons, true);
    authButtons.forEach((button) => {
      button.textContent = fallbackModel.loginLabel;
      button.dataset.authAction = fallbackModel.authAction;
      button.dataset.guest = "true";
    });
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const payload = serializeForm(event.currentTarget);

  if (payload.password !== payload.confirmPassword) {
    setMessage("两次输入的密码不一致。", "error");
    return;
  }

  const response = await apiFetch("/auth/register-request", {
    method: "POST",
    body: JSON.stringify({
      accountName: payload.accountName,
      password: payload.password,
      email: payload.email,
      agreeToTerms: Boolean(payload.agreeToTerms)
    })
  });

  let message = "账号创建成功，请直接登录。";
  if (response.activationToken) {
    byId("activateToken").value = response.activationToken;
    message += ` 开发环境激活码：${response.activationToken}`;
    switchView("activate");
  } else {
    switchView("login");
  }

  setMessage(message, "success");
}

async function handleActivateSubmit(event) {
  event.preventDefault();
  const payload = serializeForm(event.currentTarget);

  await apiFetch("/auth/activate", {
    method: "POST",
    body: JSON.stringify({ token: payload.token })
  });

  setMessage("账号已激活，请使用账号密码登录。", "success");
  switchView("login");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const payload = serializeForm(event.currentTarget);

  await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      accountName: payload.accountName,
      password: payload.password
    })
  });

  await refreshSessionUi();
  closeAuthModal();
  setMessage("登录成功。", "success");
}

async function handleForgotSubmit(event) {
  event.preventDefault();
  const payload = serializeForm(event.currentTarget);

  const response = await apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      accountOrEmail: payload.accountOrEmail
    })
  });

  let message = response.message;
  if (response.resetToken) {
    byId("resetToken").value = response.resetToken;
    message += ` 开发环境重置码：${response.resetToken}`;
    switchView("reset");
  }

  setMessage(message, "success");
}

async function handleResetSubmit(event) {
  event.preventDefault();
  const payload = serializeForm(event.currentTarget);

  if (payload.newPassword !== payload.confirmPassword) {
    setMessage("两次输入的新密码不一致。", "error");
    return;
  }

  await apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token: payload.token,
      newPassword: payload.newPassword
    })
  });

  setMessage("密码已重置，请重新登录。", "success");
  switchView("login");
}

async function handleLogout() {
  await apiFetch("/auth/logout", { method: "POST" });
  await refreshSessionUi();
  setMessage("已退出登录。", "success");
}

function wireAuthButtons() {
  document.querySelectorAll("[data-auth-cta]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (button.dataset.authAction === "logout") {
        await handleLogout();
        await refreshSessionUi();
        const menu = button.closest("#mobileMenu");
        if (menu) {
          closeMobile();
        }
        return;
      }
      openAuthModal("login");
    });
  });

  document.querySelectorAll("[data-switch-auth-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      switchView(button.dataset.switchAuthView);
    });
  });

  document.querySelectorAll("[data-auth-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeAuthModal();
    });
  });
}

function wireForms() {
  byId("loginForm")?.addEventListener("submit", (event) => {
    handleLoginSubmit(event).catch((error) => setMessage(error.message, "error"));
  });
  byId("registerForm")?.addEventListener("submit", (event) => {
    handleRegisterSubmit(event).catch((error) => setMessage(error.message, "error"));
  });
  byId("activateForm")?.addEventListener("submit", (event) => {
    handleActivateSubmit(event).catch((error) => setMessage(error.message, "error"));
  });
  byId("forgotForm")?.addEventListener("submit", (event) => {
    handleForgotSubmit(event).catch((error) => setMessage(error.message, "error"));
  });
  byId("resetForm")?.addEventListener("submit", (event) => {
    handleResetSubmit(event).catch((error) => setMessage(error.message, "error"));
  });
}

function applyQueryDrivenView() {
  const params = new URLSearchParams(window.location.search);
  const activationToken = params.get("activate");
  const resetToken = params.get("reset");

  if (activationToken) {
    byId("activateToken").value = activationToken;
    openAuthModal("activate");
    return;
  }

  if (resetToken) {
    byId("resetToken").value = resetToken;
    openAuthModal("reset");
  }
}

if (typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    ensureToastRoot();
    wireAuthButtons();
    wireForms();
    refreshSessionUi().catch(() => {
      setMessage("认证服务暂时不可用，请稍后再试。", "error");
    });
    applyQueryDrivenView();
  });
}
