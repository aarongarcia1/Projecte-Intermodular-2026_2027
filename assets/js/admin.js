
import {
  supabase,
  requireUser,
  signOut,
  showMessage,
  escapeHtml
} from "./supabase-client.js";

const list = document.querySelector("#admin-requests");
const msg = document.querySelector("#admin-message");
const usersList = document.querySelector("#admin-users");
const refreshUsersButton = document.querySelector("#refresh-users");

document.querySelector("#logout").addEventListener("click", signOut);
document.querySelector("#refresh").addEventListener("click", load);

const user = await requireUser();

const {
  data: profile,
  error: profileError
} = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();

if (profileError || profile?.role !== "admin") {
  list.innerHTML =
    '<p class="message error">No tienes permisos para acceder al panel de administración.</p>';

  if (usersList) {
    usersList.innerHTML = "";
  }

  throw new Error("Acceso de administrador denegado");
}

const labels = {
  received: "Recibida",
  reviewing: "En revisión",
  quoted: "Presupuesto enviado",
  in_progress: "En curso",
  completed: "Completada",
  rejected: "Rechazada"
};

// ------------------------------------------
// GESTIÓN DE USUARIOS
// ------------------------------------------

async function loadUsers() {
  if (!usersList) {
    return;
  }

  usersList.innerHTML =
    '<p class="muted">Cargando usuarios…</p>';

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, company, phone, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    usersList.innerHTML =
      `<p class="message error">${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    usersList.innerHTML =
      '<p class="muted">No hay perfiles registrados todavía.</p>';
    return;
  }

  usersList.innerHTML = data.map((client) => `
    <article class="admin-request">
      <div class="admin-request-head">
        <div>
          <span class="pill">
            ${escapeHtml(client.role || "client")}
          </span>
          <h3>${escapeHtml(client.full_name || "Sin nombre")}</h3>
          <p class="muted">
            ${escapeHtml(client.company || "Sin empresa")}
          </p>
        </div>
      </div>

      <p>
        <strong>Teléfono:</strong>
        ${escapeHtml(client.phone || "No indicado")}
      </p>

      <p>
        <strong>Fecha de registro:</strong>
        ${
          client.created_at
            ? new Date(client.created_at).toLocaleDateString("es-ES")
            : "No disponible"
        }
      </p>

      <button
        class="btn secondary small view-user-requests"
        type="button"
        data-user-id="${escapeHtml(client.id)}"
      >
        Ver solicitudes de este cliente
      </button>

      <div
        class="user-requests"
        id="user-requests-${escapeHtml(client.id)}"
        hidden
      ></div>
    </article>
  `).join("");

  usersList.querySelectorAll(".view-user-requests")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        await loadUserRequests(button.dataset.userId);
      });
    });
}

async function loadUserRequests(userId) {
  const container = document.getElementById(`user-requests-${userId}`);

  if (!container) {
    return;
  }

  if (!container.hidden) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML =
    '<p class="muted">Cargando solicitudes del cliente…</p>';

  const { data, error } = await supabase
    .from("audit_requests")
    .select("id, service_type, description, status, budget_amount, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML =
      `<p class="message error">${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML =
      '<p class="muted">Este cliente todavía no tiene solicitudes.</p>';
    return;
  }

  container.innerHTML = data.map((request) => `
    <div class="panel">
      <h4>${escapeHtml(request.service_type || "Solicitud")}</h4>
      <p>${escapeHtml(request.description || "")}</p>
      <p>
        <strong>Estado:</strong>
        ${escapeHtml(labels[request.status] || request.status || "Sin estado")}
      </p>
      <p>
        <strong>Presupuesto:</strong>
        ${
          request.budget_amount == null
            ? "Pendiente"
            : `${Number(request.budget_amount).toLocaleString("es-ES", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })} €`
        }
      </p>
      <p class="muted">
        ${
          request.created_at
            ? new Date(request.created_at).toLocaleString("es-ES")
            : ""
        }
      </p>
    </div>
  `).join("");
}

if (refreshUsersButton) {
  refreshUsersButton.addEventListener("click", loadUsers);
}

// ------------------------------------------
// GESTIÓN DE SOLICITUDES Y PRESUPUESTOS
// ------------------------------------------

async function load() {
  list.innerHTML =
    '<p class="muted">Cargando solicitudes…</p>';

  const {
    data,
    error
  } = await supabase
    .from("audit_requests")
    .select(`
      id,
      user_id,
      service_type,
      company_name,
      description,
      status,
      budget_amount,
      admin_notes,
      created_at,
      profiles(full_name, company)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML =
      `<p class="message error">${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML =
      '<p class="muted">No hay solicitudes todavía.</p>';
    return;
  }

  list.innerHTML = data.map((request) => `
    <article
      class="admin-request"
      data-id="${escapeHtml(request.id)}"
    >
      <div class="admin-request-head">
        <div>
          <span class="pill">
            ${escapeHtml(labels[request.status] || request.status)}
          </span>

          <h3>${escapeHtml(request.service_type)}</h3>

          <p class="muted">
            ${escapeHtml(request.profiles?.full_name || "Cliente")}
            ·
            ${escapeHtml(
              request.profiles?.company ||
              request.company_name ||
              "Sin empresa"
            )}
            ·
            ${
              request.created_at
                ? new Date(request.created_at).toLocaleString("es-ES")
                : ""
            }
          </p>
        </div>

        <small>ID ${escapeHtml(request.id.slice(0, 8))}</small>
      </div>

      <p>${escapeHtml(request.description || "")}</p>

      <form class="admin-edit" data-id="${escapeHtml(request.id)}">
        <label>
          Estado
          <select name="status">
            ${Object.entries(labels).map(([value, label]) => `
              <option
                value="${value}"
                ${value === request.status ? "selected" : ""}
              >
                ${label}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          Presupuesto (€)
          <input
            name="budget_amount"
            type="number"
            min="0"
            step="0.01"
            value="${request.budget_amount ?? ""}"
            placeholder="Sin presupuesto"
          >
        </label>

        <label class="wide">
          Nota visible para el cliente
          <textarea
            name="admin_notes"
            rows="2"
            maxlength="3000"
          >${escapeHtml(request.admin_notes || "")}</textarea>
        </label>

        <div class="wide">
          <button class="btn primary small" type="submit">
            Guardar cambios
          </button>
        </div>
      </form>
    </article>
  `).join("");

  list.querySelectorAll(".admin-edit").forEach((form) => {
    form.addEventListener("submit", save);
  });
}

async function save(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = form.dataset.id;

  const rawBudget = String(
    formData.get("budget_amount") ?? ""
  ).trim();

  const update = {
    status: formData.get("status"),
    budget_amount: rawBudget === "" ? null : Number(rawBudget),
    admin_notes: String(
      formData.get("admin_notes") ?? ""
    ).trim() || null
  };

  if (
    update.budget_amount !== null &&
    (
      !Number.isFinite(update.budget_amount) ||
      update.budget_amount < 0
    )
  ) {
    showMessage(msg, "Introduce un presupuesto válido.", "error");
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;

  try {
    const { error } = await supabase
      .from("audit_requests")
      .update(update)
      .eq("id", id);

    if (error) {
      showMessage(msg, error.message, "error");
      return;
    }

    showMessage(msg, "Solicitud actualizada.", "success");
    await load();
  } catch (error) {
    showMessage(
      msg,
      error.message || "No se pudo actualizar la solicitud.",
      "error"
    );
  } finally {
    button.disabled = false;
  }
}

// Cargar ambas secciones al entrar al panel.
await Promise.all([
  load(),
  loadUsers()
]);
