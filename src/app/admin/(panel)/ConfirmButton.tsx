"use client";

import { useFormStatus } from "react-dom";
import styles from "../admin.module.css";

/** 되돌릴 수 없는 작업 전에 한 번 더 묻는 제출 버튼 */
export default function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={styles.danger}
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "삭제 중..." : children}
    </button>
  );
}
