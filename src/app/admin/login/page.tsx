import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/supabase/admin";
import { signIn } from "../actions";
import styles from "../admin.module.css";
import SubmitButton from "../SubmitButton";

const ERRORS: Record<string, string> = {
  invalid: "이메일 또는 비밀번호가 올바르지 않습니다.",
  denied: "관리자 권한이 없는 계정입니다.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className={styles.loginPage}>
      <form action={signIn} className={styles.loginCard}>
        <h1>🔥 Fornace 관리자</h1>
        {error && ERRORS[error] && (
          <p className={styles.noticeError} role="alert">
            {ERRORS[error]}
          </p>
        )}
        <label>
          이메일
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <SubmitButton pendingLabel="로그인 중...">로그인</SubmitButton>
      </form>
    </main>
  );
}
