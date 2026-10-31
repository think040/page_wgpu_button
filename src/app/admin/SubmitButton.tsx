"use client";

import { useFormStatus } from "react-dom";
import styles from "./admin.module.css";

/** 서버 액션이 끝날 때까지 진행 상태를 보여주고 중복 제출을 막는 버튼 */
export default function SubmitButton({
  children,
  pendingLabel = "저장 중...",
  className = styles.primary,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
