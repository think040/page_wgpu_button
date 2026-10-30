import CtaCanvas from "@/components/CtaCanvas";
import Hero from "@/components/Hero";
import SiteHeader from "@/components/SiteHeader";
import styles from "./page.module.css";

const MENU = [
  { name: "마르게리타 D.O.P", desc: "산 마르차노 토마토, 물소 모짜렐라, 바질", price: "17,000", emoji: "🍅", tag: "BEST" },
  { name: "디아볼라", desc: "매콤한 살라미, 칼라브리아 고추, 꿀 한 방울", price: "21,000", emoji: "🌶️", tag: "HOT" },
  { name: "콰트로 포르마지", desc: "고르곤졸라 · 폰티나 · 파르미지아노 · 모짜렐라", price: "23,000", emoji: "🧀" },
  { name: "타르투포", desc: "트러플 크림, 양송이, 루꼴라", price: "26,000", emoji: "🍄", tag: "NEW" },
];

const STATS = [
  { value: "485°C", label: "화덕 온도" },
  { value: "72h", label: "반죽 저온 숙성" },
  { value: "90s", label: "굽는 시간" },
  { value: "12", label: "매일 굽는 반죽 종류" },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />

        <div className={styles.marquee} aria-hidden>
          <div>
            {Array.from({ length: 2 }).map((_, k) => (
              <span key={k}>
                MARGHERITA ✦ DIAVOLA ✦ QUATTRO FORMAGGI ✦ TARTUFO ✦ CALZONE ✦ MARINARA ✦&nbsp;
              </span>
            ))}
          </div>
        </div>

        <section id="about" className={styles.section}>
          <div className={styles.about}>
            <div>
              <p className={styles.eyebrow}>OUR STORY</p>
              <h2 className={styles.h2}>
                불 앞에서 <span>90초</span>,
                <br />
                그 전에 <span>72시간</span>.
              </h2>
              <p className={styles.lead}>
                Fornace는 이탈리아어로 &lsquo;화덕&rsquo;이라는 뜻입니다. 나폴리에서 직접 들여온 장작 화덕에
                참나무를 지펴 485°C까지 달군 뒤, 사흘간 천천히 숙성시킨 반죽을 단 90초 만에 구워냅니다.
                겉은 레오파드 무늬로 그을리고 속은 구름처럼 부드럽게.
              </p>
            </div>
            <ul className={styles.stats}>
              {STATS.map((s) => (
                <li key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="menu" className={styles.section}>
          <p className={styles.eyebrow}>SIGNATURE MENU</p>
          <h2 className={styles.h2}>오늘의 시그니처</h2>
          <div className={styles.menuGrid}>
            {MENU.map((m) => (
              <article key={m.name} className={styles.card}>
                {m.tag && <span className={styles.tag}>{m.tag}</span>}
                <div className={styles.cardEmoji}>{m.emoji}</div>
                <h3>{m.name}</h3>
                <p>{m.desc}</p>
                <strong>₩ {m.price}</strong>
              </article>
            ))}
          </div>
        </section>

        <section id="visit" className={styles.section}>
          <div className={styles.visit}>
            <div>
              <p className={styles.eyebrow}>VISIT</p>
              <h2 className={styles.h2}>화덕 불은 매일 켜져 있어요</h2>
            </div>
            <dl className={styles.info}>
              <div>
                <dt>주소</dt>
                <dd>서울시 마포구 화덕로 485, 1층</dd>
              </div>
              <div>
                <dt>영업시간</dt>
                <dd>11:30 – 22:00 (브레이크 15:00 – 17:00)</dd>
              </div>
              <div>
                <dt>전화</dt>
                <dd>02-485-0090</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="cta" className={styles.cta}>
          <div className={styles.ctaCopy}>
            <p className={styles.eyebrow}>CATERING · PARTY · GROUP ORDER</p>
            <h2 className={styles.h2}>
              파티에 <span>화덕</span>을 부르세요
            </h2>
            <p className={styles.lead}>단체 주문, 케이터링, 매장 대관까지. 아래 버튼을 꾹 눌러보세요.</p>
          </div>
          <CtaCanvas />
        </section>
      </main>

      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Fornace Pizza. Wood-fired since 2019.</p>
      </footer>
    </>
  );
}
