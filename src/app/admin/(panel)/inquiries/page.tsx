import Link from "next/link";
import { INQUIRY_TYPES, type InquiryType } from "@/lib/contact";
import { formatDateTime, INQUIRY_STATUSES, type Inquiry, type InquiryStatus } from "@/lib/inquiry";
import { requireAdmin } from "@/lib/supabase/admin";
import styles from "../../admin.module.css";

const PAGE_SIZE = 20;

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const status = params.status && params.status in INQUIRY_STATUSES ? (params.status as InquiryStatus) : "";
  const type = params.type && params.type in INQUIRY_TYPES ? (params.type as InquiryType) : "";
  const q = (params.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(params.page) || 1);

  let query = supabase
    .from("inquiries")
    .select("id, created_at, name, email, type, status, preferred_date", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("type", type);
  if (q) {
    // or() 필터 문법과 LIKE 와일드카드로 쓰이는 문자는 검색어에서 뺀다
    const term = q.replace(/[,()%*_\\:"]/g, " ").trim();
    if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, count, error } = await query;
  const rows = (data ?? []) as Pick<
    Inquiry,
    "id" | "created_at" | "name" | "email" | "type" | "status" | "preferred_date"
  >[];
  const total = count ?? 0;

  const pageLink = (n: number) => {
    const search = new URLSearchParams({ page: String(n) });
    if (status) search.set("status", status);
    if (type) search.set("type", type);
    if (q) search.set("q", q);
    return `/admin/inquiries?${search}`;
  };

  return (
    <>
      <h1 className={styles.title}>문의 관리</h1>

      <form className={styles.filters}>
        <select name="status" defaultValue={status} aria-label="상태">
          <option value="">전체 상태</option>
          {Object.entries(INQUIRY_STATUSES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type} aria-label="유형">
          <option value="">전체 유형</option>
          {Object.entries(INQUIRY_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder="이름 또는 이메일" aria-label="검색어" />
        <button className={styles.primary}>검색</button>
      </form>

      {error && (
        <p className={styles.noticeError} role="alert">
          문의를 불러오지 못했습니다.
        </p>
      )}

      <p className={styles.muted}>총 {total}건</p>
      {rows.length === 0 ? (
        <p className={styles.empty}>조건에 맞는 문의가 없습니다.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>접수</th>
                <th>이름</th>
                <th>이메일</th>
                <th>유형</th>
                <th>희망 날짜</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>
                    <Link href={`/admin/inquiries/${row.id}`}>{row.name}</Link>
                  </td>
                  <td>{row.email}</td>
                  <td>{INQUIRY_TYPES[row.type]}</td>
                  <td>{row.preferred_date ?? "-"}</td>
                  <td>
                    <span className={styles[`status_${row.status}`]}>{INQUIRY_STATUSES[row.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <nav className={styles.pager} aria-label="페이지">
          {page > 1 && <Link href={pageLink(page - 1)}>← 이전</Link>}
          <span>
            {page} / {Math.ceil(total / PAGE_SIZE)}
          </span>
          {page * PAGE_SIZE < total && <Link href={pageLink(page + 1)}>다음 →</Link>}
        </nav>
      )}
    </>
  );
}
