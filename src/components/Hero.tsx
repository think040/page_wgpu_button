import type { CSSProperties } from "react";
import styles from "./Hero.module.css";

const TITLE = "FORNACE";

// SSR/CSR 결과가 같도록 고정 시드로 위치를 만든다
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const EMBERS = Array.from({ length: 28 }, (_, i) => ({
  left: `${seeded(i, 1) * 100}%`,
  size: `${3 + seeded(i, 2) * 6}px`,
  duration: `${5 + seeded(i, 3) * 6}s`,
  delay: `${-seeded(i, 4) * 10}s`,
  drift: `${(seeded(i, 5) - 0.5) * 160}px`,
}));

const TOPPINGS = ["🍅", "🌿", "🧀", "🍄", "🫒", "🌶️", "🧄", "🍕"];

const PEPPERONI: Array<[number, number]> = [
  [30, 28], [62, 22], [74, 50], [50, 46], [28, 62], [56, 74], [80, 74], [38, 84], [16, 42],
];
const BASIL: Array<[number, number, number]> = [
  [44, 30, 20], [68, 38, -40], [36, 50, 70], [64, 62, 10], [22, 74, -20],
];

function PizzaFace() {
  return (
    <div className={styles.face}>
      <div className={styles.sauce} />
      <div className={styles.cheese} />
      {PEPPERONI.map(([x, y], i) => (
        <span key={`p${i}`} className={styles.pepperoni} style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {BASIL.map(([x, y, r], i) => (
        <span
          key={`b${i}`}
          className={styles.basil}
          style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${r}deg)` }}
        />
      ))}
      <div className={styles.cuts} />
    </div>
  );
}

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.rays} aria-hidden />
      <div className={styles.glow} aria-hidden />

      <div className={styles.embers} aria-hidden>
        {EMBERS.map((e, i) => (
          <span
            key={i}
            style={
              {
                left: e.left,
                width: e.size,
                height: e.size,
                animationDuration: e.duration,
                animationDelay: e.delay,
                "--drift": e.drift,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.badge}>
            <span className={styles.flame}>🔥</span> 485°C 장작 화덕 · 90초의 마법
          </p>
          <h1 className={styles.title} aria-label="Fornace Pizza">
            {TITLE.split("").map((ch, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.08}s, 0s, ${1.4 + i * 0.12}s` }}>
                {ch}
              </span>
            ))}
            <em className={styles.sub}>PIZZA</em>
          </h1>
          <p className={styles.typing}>
            <span>72시간 숙성 반죽, 오늘 아침 들어온 모짜렐라.</span>
          </p>
          <div className={styles.actions}>
            <a href="#menu" className={styles.primary}>
              메뉴 보기
            </a>
            <a href="#cta" className={styles.ghost}>
              단체 · 케이터링 문의 ↓
            </a>
          </div>
        </div>

        <div className={styles.stage} aria-hidden>
          <div className={styles.orbit}>
            {TOPPINGS.map((t, i) => (
              <span
                key={i}
                style={{ "--i": i, "--n": TOPPINGS.length } as CSSProperties}
              >
                {t}
              </span>
            ))}
          </div>
          <div className={styles.pizzaShadow} />
          <div className={styles.pizza}>
            <div className={styles.body}>
              <PizzaFace />
            </div>
            <div className={styles.slice}>
              <PizzaFace />
            </div>
            <div className={styles.strands}>
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className={styles.steam}>
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>

      <a href="#about" className={styles.scroll} aria-label="아래로 스크롤">
        <span />
      </a>
    </section>
  );
}
