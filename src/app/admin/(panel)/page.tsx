import Link from "next/link";
import { INQUIRY_TYPES, type InquiryType } from "@/lib/contact";
import { formatDateTime, INQUIRY_STATUSES, type Inquiry, type InquiryStatus } from "@/lib/inquiry";
import { requireAdmin } from "@/lib/supabase/admin";
import styles from "../admin.module.css";

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();

  const count = (column: "status" | "type", value: string) =>
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq(column, value);

  const statuses = Object.keys(INQUIRY_STATUSES) as InquiryStatus[];
  const types = Object.keys(INQUIRY_TYPES) as InquiryType[];
  const [statusCounts, typeCounts, recent] = await Promise.all([
    Promise.all(statuses.map((s) => count("status", s))),
    Promise.all(types.map((t) => count("type", t))),
    supabase
      .from("inquiries")
      .select("id, created_at, name, type, status")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const inquiries = (recent.data ?? []) as Pick<Inquiry, "id" | "created_at" | "name" | "type" | "status">[];

  return (
    <>
      <h1 className={styles.title}>대시보드</h1>
      {recent.error && (
        <p className={styles.noticeError} role="alert">
          문의를 불러오지 못했습니다.
        </p>
      )}

      <ul className={styles.stats}>
        {statuses.map((s, i) => (
          <li key={s}>
            <Link href={`/admin/inquiries?status=${s}`}>
              <strong>{statusCounts[i].count ?? 0}</strong>
              <span>{INQUIRY_STATUSES[s]}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className={styles.subtitle}>유형별 문의</h2>
      <ul className={styles.stats}>
        {types.map((t, i) => (
          <li key={t}>
            <Link href={`/admin/inquiries?type=${t}`}>
              <strong>{typeCounts[i].count ?? 0}</strong>
              <span>{INQUIRY_TYPES[t]}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className={styles.subtitle}>최근 문의</h2>
      {inquiries.length === 0 ? (
        <p className={styles.empty}>아직 접수된 문의가 없습니다.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>접수</th>
                <th>이름</th>
                <th>유형</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((q) => (
                <tr key={q.id}>
                  <td>{formatDateTime(q.created_at)}</td>
                  <td>
                    <Link href={`/admin/inquiries/${q.id}`}>{q.name}</Link>
                  </td>
                  <td>{INQUIRY_TYPES[q.type]}</td>
                  <td>{INQUIRY_STATUSES[q.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
