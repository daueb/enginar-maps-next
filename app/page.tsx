// app/page.tsx

import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl md:text-4xl font-semibold mb-4 text-center">
        Enginar Maps — Next.js Sürümü
      </h1>

      <p className="text-sm md:text-base text-slate-300 mb-6 text-center max-w-xl">
        Yakında burada Çankaya Üniversitesi için etkileşimli kampüs haritası ve
        navigasyon sistemi olacak. Şimdilik statik SVG haritayı gösteriyoruz.
      </p>

      <div className="w-full max-w-5xl aspect-[16/9] relative border border-slate-700 rounded-xl overflow-hidden bg-slate-900">
        <Image
          src="/campus.svg"
          alt="Enginar Maps kampüs haritası"
          fill
          priority
          className="object-contain"
        />
      </div>
    </main>
  );
}
