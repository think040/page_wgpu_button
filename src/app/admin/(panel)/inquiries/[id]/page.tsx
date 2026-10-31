import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteInquiry, updateInquiry } from "@/app/admin/actions";
import { INQUIRY_TYPES } from "@/lib/contact";
import { formatDateTime, INQUIRY_STATUSES, type Inquiry } from "@/lib/inquiry";
import { requireAdmin } from "@/lib/supabase/admin";
import styles from "../../../admin.module.css";
import SubmitButton from "../../../SubmitButton";
import ConfirmButton from "../../ConfirmButton";
import Notice from "../../Notice";

export default async function InquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const { notice } = await searchParams;

  const { data } = await supabase.from("inquiries").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inquiry = data as Inquiry;

  return (
    <>
      <Link href="/admin/inquiries" className={styles.back}>
        ← 문의 목록
      </Link>
      <h1 className={styles.title}>문의 #{inquiry.id}</h1>
      <Notice value={notice} />

      <dl className={styles.detail}>
        <div>
          <dt>접수</dt>
          <dd>{formatDateTime(inquiry.created_at)}</dd>
        </div>
        <div>
          <dt>이름</dt>
          <dd>{inquiry.name}</dd>
        </div>
        <div>
          <dt>이메일</dt>
          <dd>
            <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
          </dd>
        </div>
        <div>
          <dt>연락처</dt>
          <dd>{inquiry.phone ? <a href={`tel:${inquiry.phone}`}>{inquiry.phone}</a> : "-"}</dd>
        </div>
        <div>
          <dt>유형</dt>
          <dd>{INQUIRY_TYPES[inquiry.type]}</dd>
        </div>
        <div>
          <dt>희망 날짜</dt>
          <dd>{inquiry.preferred_date ?? "-"}</dd>
        </div>
        <div>
          <dt>예상 인원</dt>
          <dd>{inquiry.people ?? "-"}</dd>
        </div>
      </dl>

      <h2 className={styles.subtitle}>문의 내용</h2>
      <p className={styles.message}>{inquiry.message}</p>

      <form action={updateInquiry} className={styles.form}>
        <input type="hidden" name="id" value={inquiry.id} />
        <label>
          처리 상태
          <select name="status" defaultValue={inquiry.status}>
            {Object.entries(INQUIRY_STATUSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          관리자 메모
          <textarea name="memo" rows={4} maxLength={2000} defaultValue={inquiry.memo} />
        </label>
        <SubmitButton>저장</SubmitButton>
      </form>

      <form action={deleteInquiry} className={styles.dangerZone}>
        <input type="hidden" name="id" value={inquiry.id} />
        <ConfirmButton message="이 문의를 삭제할까요? 되돌릴 수 없습니다.">문의 삭제</ConfirmButton>
      </form>
    </>
  );
}
