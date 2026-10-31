"use client";

import styles from "../admin.module.css";

/** 되돌릴 수 없는 작업 전에 한 번 더 묻는 제출 버튼 */
export default function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <button
      className={styles.danger}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
