import styles from "../admin.module.css";

export default function Loading() {
  return (
    <p className={styles.loading} role="status">
      불러오는 중...
    </p>
  );
}
