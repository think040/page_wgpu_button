import styles from "../admin.module.css";

/** 서버 액션 결과 안내 (?notice=saved|error) */
export default function Notice({ value }: { value?: string }) {
  if (value === "saved") return <p className={styles.noticeOk} role="status">저장했습니다.</p>;
  if (value === "error") {
    return (
      <p className={styles.noticeError} role="alert">
        저장하지 못했습니다. 입력 내용을 확인해 주세요.
      </p>
    );
  }
  return null;
}
