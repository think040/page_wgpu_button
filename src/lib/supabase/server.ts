import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** 로그인 세션으로 동작하는 클라이언트. 관리자 화면과 서버 액션에서 사용 (RLS 적용) */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts가 맡는다.
        }
      },
    },
  });
}

/** 비로그인 공개 읽기용. 쿠키를 쓰지 않아 정적 페이지 생성에도 사용할 수 있다. */
export function createPublicClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
}

/** RLS를 우회하는 서버 전용 클라이언트. 문의 저장에만 사용하며 브라우저로 보내면 안 된다. */
export function createServiceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY ?? "", {
    auth: { persistSession: false },
  });
}
