import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import ContactForm from "./ContactForm";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "문의하기 — Fornace Pizza",
  description: "단체 주문, 케이터링, 매장 대관 문의",
};

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>CONTACT</p>
          <h1 className={styles.title}>
            화덕을 <span>예약</span>하세요 <span className={styles.wave}>🍕</span>
          </h1>
          <p className={styles.lead}>
            단체 주문, 케이터링, 매장 대관 등 무엇이든 남겨주세요.
            <br />
            영업일 기준 24시간 안에 연락드릴게요.
          </p>
          <ul className={styles.points}>
            <li>🔥 이동식 화덕 케이터링 (최소 30인)</li>
            <li>🎉 매장 단독 대관 (최대 48석)</li>
            <li>📦 20판 이상 단체 주문 10% 할인</li>
          </ul>
        </div>
        <ContactForm />
      </main>
    </>
  );
}
