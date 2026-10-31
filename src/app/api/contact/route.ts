import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { INQUIRY_TYPES, validateContact } from "@/lib/contact";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// 간단한 IP별 요청 제한 (1분에 5회). 서버리스/다중 인스턴스 환경이라면 Redis 등으로 교체하세요.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_REQUESTS;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { data, errors } = validateContact(body);
  if (!data) {
    return NextResponse.json({ ok: false, message: "입력 내용을 확인해 주세요.", errors }, { status: 400 });
  }

  const id = randomUUID().slice(0, 8).toUpperCase();

  // 허니팟이 채워져 있으면 봇으로 보고 저장하지 않되, 성공처럼 응답한다
  if (data.website) {
    return NextResponse.json({ ok: true, id }, { status: 201 });
  }

  const record = {
    id,
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    type: data.type,
    preferred_date: data.date || null,
    people: data.people ? Number(data.people) : null,
    message: data.message,
  };

  try {
    const { error } = await createServiceClient().from("inquiries").insert(record);
    if (error) throw error;
  } catch (err) {
    console.error("[contact] 저장 실패", err);
    return NextResponse.json(
      { ok: false, message: "일시적인 오류로 접수하지 못했습니다. 전화로 문의해 주세요." },
      { status: 500 },
    );
  }

  // TODO: 메일/슬랙 알림을 붙이려면 여기서 전송 (예: Resend, Nodemailer, Slack Webhook)
  console.info(`[contact] 새 문의 접수 #${id} (${INQUIRY_TYPES[data.type]}) ${record.name}`);

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
