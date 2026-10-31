"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { INQUIRY_STATUSES } from "@/lib/inquiry";
import { requireAdmin } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

const text = (form: FormData, key: string, max: number) =>
  String(form.get(key) ?? "")
    .trim()
    .slice(0, max);

export async function signIn(form: FormData) {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: text(form, "email", 120),
    password: String(form.get("password") ?? ""),
  });
  if (error) redirect("/admin/login?error=invalid");

  const { data: admin } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!admin) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=denied");
  }
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// ───────────────────────── 문의 ─────────────────────────

export async function updateInquiry(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = text(form, "id", 8);
  const status = text(form, "status", 20);
  if (!(status in INQUIRY_STATUSES)) redirect(`/admin/inquiries/${id}?notice=error`);

  const { error } = await supabase
    .from("inquiries")
    .update({ status, memo: text(form, "memo", 2000) })
    .eq("id", id);
  if (error) {
    console.error("[admin] 문의 수정 실패", error);
    redirect(`/admin/inquiries/${id}?notice=error`);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/inquiries/${id}?notice=saved`);
}

export async function deleteInquiry(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = text(form, "id", 8);
  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) {
    console.error("[admin] 문의 삭제 실패", error);
    redirect(`/admin/inquiries/${id}?notice=error`);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/inquiries");
}

// ───────────────────────── 메뉴 ─────────────────────────

export async function saveMenuItem(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = text(form, "id", 36);
  const price = Number(form.get("price"));
  const sortOrder = Number(form.get("sort_order"));
  const name = text(form, "name", 60);
  if (!name || !Number.isInteger(price) || price < 0 || !Number.isInteger(sortOrder)) {
    redirect("/admin/menu?notice=error");
  }

  const row = {
    name,
    description: text(form, "description", 200),
    price,
    emoji: text(form, "emoji", 8) || "🍕",
    tag: text(form, "tag", 12) || null,
    sort_order: sortOrder,
    is_visible: form.get("is_visible") === "on",
  };
  const { error } = id
    ? await supabase.from("menu_items").update(row).eq("id", id)
    : await supabase.from("menu_items").insert(row);
  if (error) {
    console.error("[admin] 메뉴 저장 실패", error);
    redirect("/admin/menu?notice=error");
  }
  revalidatePath("/");
  revalidatePath("/admin/menu");
  redirect("/admin/menu?notice=saved");
}

export async function deleteMenuItem(form: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("menu_items").delete().eq("id", text(form, "id", 36));
  if (error) {
    console.error("[admin] 메뉴 삭제 실패", error);
    redirect("/admin/menu?notice=error");
  }
  revalidatePath("/");
  revalidatePath("/admin/menu");
  redirect("/admin/menu?notice=saved");
}

// ───────────────────────── 매장 정보 ─────────────────────────

export async function saveSettings(form: FormData) {
  const { supabase } = await requireAdmin();
  const row = {
    address: text(form, "address", 200),
    hours: text(form, "hours", 200),
    phone: text(form, "phone", 30),
  };
  if (!row.address || !row.hours || !row.phone) redirect("/admin/settings?notice=error");

  const { error } = await supabase.from("site_settings").update(row).eq("id", 1);
  if (error) {
    console.error("[admin] 매장 정보 저장 실패", error);
    redirect("/admin/settings?notice=error");
  }
  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?notice=saved");
}
