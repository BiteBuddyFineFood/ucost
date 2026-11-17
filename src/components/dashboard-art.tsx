"use client";

import { useState } from "react";
import { Jar } from "./ui";

/** Small code-drawn objects from the everyday bookkeeping desk. */
export function DashboardSketch({
  kind,
}: {
  kind: "wallet" | "bag" | "hourglass";
}) {
  return (
    <svg
      className={`dashboard-sketch sketch-${kind}`}
      viewBox="0 0 80 68"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "wallet" && (
        <>
          <path d="M15 23L55 12Q60 11 60 17V28" fill="#DCE8DC" />
          <path d="M15 23L55 12Q60 11 60 17V28M23 22L53 17" />
          <path d="M12 27Q12 23 18 24L62 27Q66 27 65 33L63 54Q63 58 57 57L17 54Q12 54 12 49Z" fill="#EDF2E6" />
          <path d="M54 35L67 36L66 47L54 46Q48 40 54 35Z" fill="#F1DDA1" />
          <circle cx="58" cy="41" r="1.4" fill="currentColor" stroke="none" />
          <path d="M19 33L18 47M9 15L7 10M68 18L73 14" />
        </>
      )}
      {kind === "bag" && (
        <>
          <path d="M20 24L58 26L63 57Q44 62 15 56Z" fill="#F1DFC4" />
          <path className="bag-handle" d="M29 29C25 4 55 5 50 30" />
          <path d="M20 24L58 26L63 57Q44 62 15 56ZM22 31L19 51M54 32L57 51" />
          <path d="M31 42Q40 35 48 43Q45 54 35 50Z" fill="#E4ECE0" />
          <path d="M39 40Q38 33 45 32M64 12L66 7M69 22L75 20M11 20L7 17" />
        </>
      )}
      {kind === "hourglass" && (
        <>
          <path d="M24 13L56 14M22 56L57 57" strokeWidth="3" />
          <path d="M27 15Q25 28 36 34Q25 42 27 54L53 55Q56 42 44 34Q55 27 53 16Z" fill="#EDF4F0" />
          <path d="M29 22L51 23Q48 29 40 33Q32 28 29 22ZM29 53Q34 43 40 40Q48 45 51 54Z" fill="#E8CF8E" stroke="none" />
          <path className="hourglass-grain" d="M40 35V38" />
          <path d="M18 32L12 30M61 29L67 25M61 44L66 46" />
        </>
      )}
    </svg>
  );
}

export function PlayfulJar() {
  const [tap, setTap] = useState(0);
  return (
    <div className="playful-jar">
      <button
        className="jar-play-button"
        aria-label="点点省钱罐，播放投币动画，不改变金额"
        onClick={() => setTap((value) => value + 1)}
      >
        <span key={tap} className={tap ? "jar-drawing is-tapped" : "jar-drawing"}>
          <Jar />
          {tap > 0 && (
            <svg className="jar-twinkle" viewBox="0 0 220 190" aria-hidden="true">
              <path d="M40 45V31M33 38H47M180 61V47M173 54H187" />
            </svg>
          )}
        </span>
        <span className="jar-play-caption">点点罐子</span>
      </button>
    </div>
  );
}
