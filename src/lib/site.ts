import { createPublicClient } from "@/lib/supabase/server";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  emoji: string;
  tag: string | null;
}

export interface SiteSettings {
  address: string;
  hours: string;
  phone: string;
}

// DB를 읽지 못해도 홈페이지가 비지 않도록 쓰는 기본값
const DEFAULT_MENU: MenuItem[] = [
  { id: "margherita", name: "마르게리타 D.O.P", description: "산 마르차노 토마토, 물소 모짜렐라, 바질", price: 17000, emoji: "🍅", tag: "BEST" },
  { id: "diavola", name: "디아볼라", description: "매콤한 살라미, 칼라브리아 고추, 꿀 한 방울", price: 21000, emoji: "🌶️", tag: "HOT" },
  { id: "formaggi", name: "콰트로 포르마지", description: "고르곤졸라 · 폰티나 · 파르미지아노 · 모짜렐라", price: 23000, emoji: "🧀", tag: null },
  { id: "tartufo", name: "타르투포", description: "트러플 크림, 양송이, 루꼴라", price: 26000, emoji: "🍄", tag: "NEW" },
];

const DEFAULT_SETTINGS: SiteSettings = {
  address: "서울시 마포구 화덕로 485, 1층",
  hours: "11:30 – 22:00 (브레이크 15:00 – 17:00)",
  phone: "02-485-0090",
};

/** 홈페이지에 보여줄 메뉴와 매장 정보 */
export async function getSiteContent(): Promise<{ menu: MenuItem[]; settings: SiteSettings }> {
  try {
    const supabase = createPublicClient();
    const [menu, settings] = await Promise.all([
      supabase
        .from("menu_items")
        .select("id, name, description, price, emoji, tag")
        .eq("is_visible", true)
        .order("sort_order"),
      supabase.from("site_settings").select("address, hours, phone").eq("id", 1).single(),
    ]);
    if (menu.error) throw menu.error;
    if (settings.error) throw settings.error;
    return { menu: menu.data, settings: settings.data };
  } catch (err) {
    console.error("[site] 내용을 불러오지 못해 기본값을 사용합니다", err);
    return { menu: DEFAULT_MENU, settings: DEFAULT_SETTINGS };
  }
}
