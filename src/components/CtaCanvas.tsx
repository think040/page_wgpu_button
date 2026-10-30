"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ButtonScene } from "@/lib/webgpu/ButtonScene";
import styles from "./CtaCanvas.module.css";

type Status = "loading" | "ready" | "unsupported";

export default function CtaCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [hover, setHover] = useState(false);

  useEffect(() => {
    router.prefetch("/contact");
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!ButtonScene.isSupported()) {
      setStatus("unsupported");
      return;
    }

    const scene = new ButtonScene(canvas, {
      onActivate: () => router.push("/contact"),
      onHoverChange: setHover,
    });
    scene
      .init()
      .then(() => setStatus("ready"))
      .catch((err) => {
        console.warn("[WebGPU]", err);
        setStatus("unsupported");
      });

    return () => scene.destroy();
  }, [router]);

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: hover ? "pointer" : "default", opacity: status === "ready" ? 1 : 0 }}
        aria-label="3D 문의하기 버튼 — 누르면 문의 페이지로 이동합니다"
        role="img"
      />
      {status === "loading" && <div className={styles.loading}>🔥 오븐 예열 중...</div>}
      {status === "unsupported" ? (
        <div className={styles.fallback}>
          <p>이 브라우저는 WebGPU를 지원하지 않아 3D 버튼 대신 일반 버튼을 보여드려요.</p>
          <Link href="/contact" className={styles.fallbackButton}>
            지금 문의하기 →
          </Link>
        </div>
      ) : (
        // 스크린리더/키보드 사용자를 위한 접근 가능한 링크
        <Link href="/contact" className={styles.srOnly}>
          문의 페이지로 이동
        </Link>
      )}
    </div>
  );
}
