import { redirect } from "next/navigation";
import { cache } from "react";
import { createSessionClient } from "./server";

/** 현재 로그인한 관리자. 관리자가 아니면 null */
export const getAdmin = cache(async () => {
  try {
    const supabase = await createSessionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return data ? user : null;
  } catch {
    return null;
  }
});

/** 서버 액션은 공개 엔드포인트이므로 각 액션 시작에서 반드시 호출한다 */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return { admin, supabase: await createSessionClient() };
}
