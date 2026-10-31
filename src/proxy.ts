import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/server";

/** /admin 요청마다 만료된 세션을 갱신하고, 비로그인 사용자를 로그인 화면으로 보낸다. 관리자 판정은 getAdmin이 한다. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let loggedIn = false;

  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    loggedIn = !!data;
  } catch (err) {
    console.error("[admin] 세션 확인 실패", err);
  }

  if (!loggedIn && request.nextUrl.pathname !== "/admin/login") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return response;
}

export const config = {
  matcher: "/admin/:path*",
};
