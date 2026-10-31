// 관리자 화면에서 쓰는 문의 정의

import type { InquiryType } from "./contact";

export const INQUIRY_STATUSES = {
  new: "신규",
  in_progress: "처리 중",
  done: "완료",
} as const;

export type InquiryStatus = keyof typeof INQUIRY_STATUSES;

export interface Inquiry {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string | null;
  type: InquiryType;
  preferred_date: string | null;
  people: number | null;
  message: string;
  status: InquiryStatus;
  memo: string;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  });
}
