import { deleteMenuItem, saveMenuItem } from "@/app/admin/actions";
import type { MenuItem } from "@/lib/site";
import { requireAdmin } from "@/lib/supabase/admin";
import styles from "../../admin.module.css";
import ConfirmButton from "../ConfirmButton";
import Notice from "../Notice";

type Row = MenuItem & { sort_order: number; is_visible: boolean };

function MenuFields({ item, nextOrder }: { item?: Row; nextOrder: number }) {
  return (
    <>
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <div className={styles.menuFields}>
        <label>
          이모지
          <input name="emoji" maxLength={8} defaultValue={item?.emoji ?? "🍕"} />
        </label>
        <label>
          이름 *
          <input name="name" maxLength={60} required defaultValue={item?.name} />
        </label>
        <label>
          가격(원) *
          <input name="price" type="number" min={0} step={100} required defaultValue={item?.price} />
        </label>
        <label>
          태그
          <input name="tag" maxLength={12} placeholder="BEST" defaultValue={item?.tag ?? ""} />
        </label>
        <label>
          순서
          <input name="sort_order" type="number" required defaultValue={item?.sort_order ?? nextOrder} />
        </label>
      </div>
      <label>
        설명
        <input name="description" maxLength={200} defaultValue={item?.description} />
      </label>
      <label className={styles.check}>
        <input name="is_visible" type="checkbox" defaultChecked={item?.is_visible ?? true} />
        홈페이지에 표시
      </label>
    </>
  );
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { notice } = await searchParams;
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, description, price, emoji, tag, sort_order, is_visible")
    .order("sort_order");
  const items = (data ?? []) as Row[];
  const nextOrder = (items.at(-1)?.sort_order ?? 0) + 10;

  return (
    <>
      <h1 className={styles.title}>메뉴 관리</h1>
      <Notice value={notice} />
      {error && (
        <p className={styles.noticeError} role="alert">
          메뉴를 불러오지 못했습니다.
        </p>
      )}

      {items.map((item) => (
        <section key={item.id} className={styles.card}>
          <form action={saveMenuItem} className={styles.form}>
            <MenuFields item={item} nextOrder={nextOrder} />
            <button className={styles.primary}>저장</button>
          </form>
          <form action={deleteMenuItem}>
            <input type="hidden" name="id" value={item.id} />
            <ConfirmButton message={`'${item.name}' 메뉴를 삭제할까요? 되돌릴 수 없습니다.`}>삭제</ConfirmButton>
          </form>
        </section>
      ))}

      <h2 className={styles.subtitle}>새 메뉴 추가</h2>
      <section className={styles.card}>
        <form action={saveMenuItem} className={styles.form}>
          <MenuFields nextOrder={nextOrder} />
          <button className={styles.primary}>추가</button>
        </form>
      </section>
    </>
  );
}
