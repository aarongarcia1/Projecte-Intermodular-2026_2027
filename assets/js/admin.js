import { supabase, requireUser, signOut, showMessage, escapeHtml } from "./supabase-client.js";
const list=document.querySelector("#admin-requests"), msg=document.querySelector("#admin-message");
document.querySelector("#logout").addEventListener("click",signOut);
document.querySelector("#refresh").addEventListener("click",load);
const user=await requireUser();
const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).single();
if(profileError || profile?.role!=="admin"){
  list.innerHTML='<p class="message error">No tienes permisos para acceder al panel de administración.</p>';
  throw new Error("Acceso de administrador denegado");
}
const labels={received:"Recibida",reviewing:"En revisión",quoted:"Presupuesto enviado",in_progress:"En curso",completed:"Completada",rejected:"Rechazada"};
async function load(){
  list.innerHTML='<p class="muted">Cargando solicitudes…</p>';
  const {data,error}=await supabase.from("audit_requests").select("id,user_id,service_type,company_name,description,status,budget_amount,admin_notes,created_at,profiles(full_name,company)").order("created_at",{ascending:false});
  if(error){list.innerHTML=`<p class="message error">${escapeHtml(error.message)}</p>`;return;}
  if(!data?.length){list.innerHTML='<p class="muted">No hay solicitudes todavía.</p>';return;}
  list.innerHTML=data.map(r=>`<article class="admin-request" data-id="${escapeHtml(r.id)}">
  <div class="admin-request-head"><div><span class="pill">${escapeHtml(labels[r.status]||r.status)}</span><h3>${escapeHtml(r.service_type)}</h3><p class="muted">${escapeHtml(r.profiles?.full_name||"Cliente")} · ${escapeHtml(r.profiles?.company||r.company_name||"Sin empresa")} · ${new Date(r.created_at).toLocaleString("es-ES")}</p></div><small>ID ${escapeHtml(r.id.slice(0,8))}</small></div>
  <p>${escapeHtml(r.description)}</p>
  <form class="admin-edit" data-id="${escapeHtml(r.id)}">
  <label>Estado<select name="status">${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${v===r.status?"selected":""}>${l}</option>`).join("")}</select></label>
  <label>Presupuesto (€)<input name="budget_amount" type="number" min="0" step="0.01" value="${r.budget_amount??""}" placeholder="Sin presupuesto"></label>
  <label class="wide">Nota visible para el cliente<textarea name="admin_notes" rows="2" maxlength="3000">${escapeHtml(r.admin_notes||"")}</textarea></label>
  <div class="wide"><button class="btn primary small" type="submit">Guardar cambios</button></div></form></article>`).join("");
  list.querySelectorAll(".admin-edit").forEach(form=>form.addEventListener("submit",save));
}
async function save(e){
  e.preventDefault(); const form=e.currentTarget, fd=new FormData(form), id=form.dataset.id;
  const raw=String(fd.get("budget_amount")).trim();
  const update={status:fd.get("status"),budget_amount:raw===""?null:Number(raw),admin_notes:String(fd.get("admin_notes")).trim()||null};
  if(update.budget_amount!==null && (!Number.isFinite(update.budget_amount)||update.budget_amount<0)){showMessage(msg,"Introduce un presupuesto válido.","error");return;}
  const button=form.querySelector("button");button.disabled=true;
  const {error}=await supabase.from("audit_requests").update(update).eq("id",id);
  button.disabled=false;
  if(error)showMessage(msg,error.message,"error");else{showMessage(msg,"Solicitud actualizada.","success");await load();}
}
await load();
