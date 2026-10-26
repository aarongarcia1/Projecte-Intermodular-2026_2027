import { supabase, requireUser, signOut, showMessage } from "./supabase-client.js";
const form = document.querySelector("#profile-form"), msg = document.querySelector("#message");
document.querySelector("#logout").addEventListener("click", signOut);
const user = await requireUser();
document.querySelector("#email").value = user.email || "";
const { data, error } = await supabase.from("profiles").select("full_name,company,phone").eq("id",user.id).single();
if (error) showMessage(msg,error.message,"error");
else for (const key of ["full_name","company","phone"]) form.elements[key].value = data[key] || "";
form.addEventListener("submit",async e=>{
  e.preventDefault(); const fd=new FormData(form);
  const {error}=await supabase.from("profiles").update({
    full_name:fd.get("full_name").trim(), company:fd.get("company").trim()||null, phone:fd.get("phone").trim()||null
  }).eq("id",user.id);
  showMessage(msg,error ? error.message : "Perfil actualizado correctamente.",error ? "error" : "success");
});
