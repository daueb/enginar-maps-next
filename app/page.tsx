// app/page.tsx
"use client";

import Script from "next/script";

export default function Page() {
  return (
    <>
      <div className="navbar">
        <b>
          Enginar <span>Maps</span>
        </b>
        <div
          id="parseOut"
          style={{ fontSize: "12px", color: "#6b7280", marginLeft: "12px" }}
        ></div>
        <form id="classSearch" className="search" autoComplete="off">
          <input
            id="classQuery"
            type="text"
            placeholder="Sınıf / Bina ara (örn: H-101, Hukuk B08, YDB Z05)"
            aria-label="Haritada ara"
          />
          <button type="submit">Ara</button>
        </form>
      </div>

      <div id="wrap">
        <div id="mount"></div>
        <div id="pinLayer"></div>
      </div>

      <div id="infoSheet" className="sheet" aria-hidden="true">
        <div className="grab"></div>
        <div className="content">
          <div id="roomHead" className="room-head" hidden>
            <span className="chip block" id="rhBlock"></span>
            <span className="chip floor" id="rhFloor"></span>
            <span className="chip room" id="rhRoom"></span>
          </div>
          <h2
            id="iTitle"
            style={{
              margin: "0 0 6px 0",
              fontSize: "18px",
              color: "var(--ink)",
              fontWeight: 700,
            }}
          >
            —
          </h2>
          <div
            id="iSub"
            style={{ color: "var(--muted)", fontSize: "13px", marginBottom: 10 }}
          >
            —
          </div>
          <p
            id="iDesc"
            style={{
              margin: 0,
              color: "#111827",
              fontSize: "14px",
              lineHeight: 1.45,
              position: "relative",
            }}
          >
            <span id="iDescText">—</span>
            <a
              id="iMore"
              href="#"
              role="button"
              aria-label="devamını okuyun"
            >
              … devamını okuyun
            </a>
          </p>
        </div>
      </div>

      {/* Harita JS’i (eski index.html içindeki <script> gövdesi) */}
      <Script src="/maps.js" strategy="afterInteractive" />
    </>
  );
}
