import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/supabase/admin";
import { signOut } from "../actions";
import styles from "../admin.module.css";
import SubmitButton from "../SubmitButton";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login?error=denied");

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/admin" className={styles.brand}>
          🔥 Fornace 관리자
        </Link>
        <nav className={styles.nav}>
          <Link href="/admin">대시보드</Link>
          <Link href="/admin/inquiries">문의</Link>
          <Link href="/admin/menu">메뉴</Link>
          <Link href="/admin/settings">매장 정보</Link>
          <Link href="/" target="_blank">
            사이트 보기 ↗
          </Link>
        </nav>
        <form action={signOut} className={styles.account}>
          <span>{admin.email}</span>
          <SubmitButton className={styles.ghost} pendingLabel="로그아웃 중...">
            로그아웃
          </SubmitButton>
        </form>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
