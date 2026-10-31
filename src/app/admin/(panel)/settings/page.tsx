import { saveSettings } from "@/app/admin/actions";
import type { SiteSettings } from "@/lib/site";
import { requireAdmin } from "@/lib/supabase/admin";
import styles from "../../admin.module.css";
import SubmitButton from "../../SubmitButton";
import Notice from "../Notice";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { notice } = await searchParams;
  const { data } = await supabase.from("site_settings").select("address, hours, phone").eq("id", 1).maybeSingle();
  const settings = data as SiteSettings | null;

  return (
    <>
      <h1 className={styles.title}>매장 정보</h1>
      <Notice value={notice} />
      {!settings ? (
        <p className={styles.noticeError} role="alert">
          매장 정보를 불러오지 못했습니다.
        </p>
      ) : (
        <form action={saveSettings} className={styles.form}>
          <label>
            주소
            <input name="address" maxLength={200} required defaultValue={settings.address} />
          </label>
          <label>
            영업시간
            <input name="hours" maxLength={200} required defaultValue={settings.hours} />
          </label>
          <label>
            전화
            <input name="phone" maxLength={30} required defaultValue={settings.phone} />
          </label>
          <SubmitButton>저장</SubmitButton>
        </form>
      )}
    </>
  );
}
