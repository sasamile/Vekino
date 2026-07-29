import type { Metadata } from "next";
import { ConnectedExperience } from "@/components/landing/connected-experience";
import { DownloadAppSection } from "@/components/landing/download-app-section";
import { EcosystemSection } from "@/components/landing/ecosystem-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";
import { HeroSection } from "@/components/landing/hero-section";
import { ManifestoSection } from "@/components/landing/manifesto-section";
import { Navbar } from "@/components/landing/navbar";
import { ScrollTriggerRefresh } from "@/components/landing/scroll-trigger-refresh";
import { SectionParallax } from "@/components/landing/section-parallax";
import { SmoothViewport } from "@/components/landing/smooth-viewport";
import { TestimonialsSection } from "@/components/landing/testimonials-section";

export const metadata: Metadata = {
  title: "Vekino | Plataforma para administrar conjuntos residenciales",
  description:
    "Centraliza la administración, los pagos, las visitas, las reservas, la comunicación y la seguridad de tu conjunto residencial con Vekino.",
  keywords: [
    "software para propiedad horizontal",
    "plataforma para administrar conjuntos residenciales",
    "aplicación para condominios",
    "administración de conjuntos",
    "control de visitantes para conjuntos residenciales",
    "reservas de zonas comunes",
    "comunicación con residentes",
  ],
  alternates: { canonical: "https://vekino.co" },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Vekino",
    title: "Vekino | Plataforma para administrar conjuntos residenciales",
    description:
      "Todo tu conjunto, conectado en un solo lugar. Administración, pagos, visitas, reservas y comunicación en una sola plataforma.",
    url: "https://vekino.co",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vekino | Plataforma para administrar conjuntos residenciales",
    description:
      "Todo tu conjunto, conectado en un solo lugar. Administración, pagos, visitas, reservas y comunicación en una sola plataforma.",
  },
};

/* Datos estructurados: ayudan a que el producto se entienda como software. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Vekino",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description:
    "Plataforma para la administración integral de conjuntos residenciales y condominios.",
  inLanguage: "es-CO",
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <SectionParallax />
      <ScrollTriggerRefresh />
      {/* El navbar es fixed: debe quedar FUERA del contenedor suavizado. */}
      <Navbar />
      <SmoothViewport>
        <main className="landing-main">
          {/* El único h1 de la página vive dentro del hero. */}
          <HeroSection />

          {/* Cada sección va dentro de su propio "slot". Es lo que permite
              que el pare y la transición convivan: ScrollTrigger fija el
              slot, y la animación de salida transforma la sección de adentro.
              Sobre el mismo elemento se pisaban —dentro de ScrollSmoother el
              pin también usa `transform`— y una anulaba a la otra. */}
          <div className="section-slot">
            <ManifestoSection />
          </div>
          <div className="section-slot">
            <ConnectedExperience />
          </div>
          <div className="section-slot">
            <FeaturesSection />
          </div>
          <div className="section-slot">
            <DownloadAppSection />
          </div>
          <div className="section-slot">
            <TestimonialsSection />
          </div>
          <div className="section-slot">
            <EcosystemSection />
          </div>
          <div className="section-slot">
            <FinalCTA />
          </div>
        </main>
        <Footer />
      </SmoothViewport>
    </>
  );
}
