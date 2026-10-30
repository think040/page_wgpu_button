// 문의 폼 데이터 정의와 검증 — 클라이언트와 API Route에서 함께 사용

export const INQUIRY_TYPES = {
  group: "단체 주문",
  catering: "케이터링",
  rental: "매장 대관",
  etc: "기타 문의",
} as const;

export type InquiryType = keyof typeof INQUIRY_TYPES;

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  type: InquiryType;
  date: string;
  people: string;
  message: string;
  /** 스팸 봇 차단용 숨김 필드 (사람은 비워둠) */
  website?: string;
}

export type ContactErrors = Partial<Record<keyof ContactInput, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{8,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateContact(raw: unknown): { data?: ContactInput; errors: ContactErrors } {
  const errors: ContactErrors = {};
  const src = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof src[k] === "string" ? (src[k] as string).trim() : "");

  const data: ContactInput = {
    name: str("name"),
    email: str("email"),
    phone: str("phone"),
    type: str("type") as InquiryType,
    date: str("date"),
    people: str("people"),
    message: str("message"),
    website: str("website"),
  };

  if (!data.name) errors.name = "이름을 입력해 주세요.";
  else if (data.name.length > 50) errors.name = "이름은 50자 이내로 입력해 주세요.";

  if (!EMAIL_RE.test(data.email) || data.email.length > 120) errors.email = "올바른 이메일 주소를 입력해 주세요.";

  if (data.phone && !PHONE_RE.test(data.phone)) errors.phone = "올바른 연락처를 입력해 주세요.";

  if (!(data.type in INQUIRY_TYPES)) errors.type = "문의 유형을 선택해 주세요.";

  if (data.date && !DATE_RE.test(data.date)) errors.date = "날짜 형식이 올바르지 않습니다.";

  if (data.people) {
    const n = Number(data.people);
    if (!Number.isInteger(n) || n < 1 || n > 1000) errors.people = "인원은 1~1000 사이 숫자로 입력해 주세요.";
  }

  if (data.message.length < 10) errors.message = "문의 내용을 10자 이상 입력해 주세요.";
  else if (data.message.length > 2000) errors.message = "문의 내용은 2000자 이내로 입력해 주세요.";

  return Object.keys(errors).length ? { errors } : { data, errors };
}
