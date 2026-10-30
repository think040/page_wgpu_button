import Link from "next/link";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        <span aria-hidden>🍕</span> FORNACE
      </Link>
      <nav className={styles.nav}>
        <a href="/#about">소개</a>
        <a href="/#menu">메뉴</a>
        <a href="/#visit">오시는 길</a>
        <Link href="/contact" className={styles.cta}>
          문의하기
        </Link>
      </nav>
    </header>
  );
}
