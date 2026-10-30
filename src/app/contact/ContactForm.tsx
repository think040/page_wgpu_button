"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { INQUIRY_TYPES, validateContact, type ContactErrors } from "@/lib/contact";
import styles from "./contact.module.css";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; id: string }
  | { kind: "error"; message: string };

export default function ContactForm() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [errors, setErrors] = useState<ContactErrors>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.currentTarget));

    const local = validateContact(payload);
    setErrors(local.errors);
    if (!local.data) return;

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setState({ kind: "success", id: json.id });
      } else {
        setErrors(json.errors ?? {});
        setState({ kind: "error", message: json.message ?? "전송에 실패했습니다." });
      }
    } catch {
      setState({ kind: "error", message: "네트워크 오류가 발생했습니다. 다시 시도해 주세요." });
    }
  }

  if (state.kind === "success") {
    return (
      <div className={styles.success} role="status">
        <div className={styles.successIcon}>🍕</div>
        <h2>문의가 접수되었어요!</h2>
        <p>
          접수번호 <strong>#{state.id}</strong>
          <br />곧 연락드릴게요. 화덕 예열해 둘게요 🔥
        </p>
        <Link href="/" className={styles.submit}>
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const field = (name: keyof ContactErrors) =>
    errors[name] ? (
      <span className={styles.error} id={`${name}-error`}>
        {errors[name]}
      </span>
    ) : null;
  const aria = (name: keyof ContactErrors) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.row}>
        <label>
          이름 *
          <input name="name" autoComplete="name" placeholder="홍길동" {...aria("name")} />
          {field("name")}
        </label>
        <label>
          이메일 *
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" {...aria("email")} />
          {field("email")}
        </label>
      </div>

      <div className={styles.row}>
        <label>
          연락처
          <input name="phone" type="tel" autoComplete="tel" placeholder="010-1234-5678" {...aria("phone")} />
          {field("phone")}
        </label>
        <label>
          문의 유형 *
          <select name="type" defaultValue="" {...aria("type")}>
            <option value="" disabled>
              선택해 주세요
            </option>
            {Object.entries(INQUIRY_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {field("type")}
        </label>
      </div>

      <div className={styles.row}>
        <label>
          희망 날짜
          <input name="date" type="date" {...aria("date")} />
          {field("date")}
        </label>
        <label>
          예상 인원
          <input name="people" type="number" min={1} max={1000} inputMode="numeric" placeholder="30" {...aria("people")} />
          {field("people")}
        </label>
      </div>

      <label>
        문의 내용 *
        <textarea
          name="message"
          rows={6}
          placeholder="행사 성격, 원하는 메뉴, 장소 등을 알려주세요."
          {...aria("message")}
        />
        {field("message")}
      </label>

      {/* 허니팟: 사람에게는 보이지 않음 */}
      <input name="website" tabIndex={-1} autoComplete="off" className={styles.honeypot} aria-hidden />

      {state.kind === "error" && (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      )}

      <button className={styles.submit} disabled={state.kind === "submitting"}>
        {state.kind === "submitting" ? "화덕에 넣는 중..." : "문의 보내기 🔥"}
      </button>
    </form>
  );
}
