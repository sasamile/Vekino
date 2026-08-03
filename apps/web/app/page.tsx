import type { Metadata } from "next";
import { AppSection } from "@/components/landing/app-section";
import { ContactSection } from "@/components/landing/contact-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FeatureAccordion } from "@/components/landing/feature-accordion";
import { FeaturesGrid } from "@/components/landing/features-grid";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { HeroSection } from "@/components/landing/hero-section";
import { LogoCloud } from "@/components/landing/logo-cloud";
import { NewsletterSection } from "@/components/landing/newsletter-section";
import { PageFrame } from "@/components/landing/page-frame";
import { PricingSection } from "@/components/landing/pricing-section";
import { StatsSection } from "@/components/landing/stats-section";
import { TestimonialsCarousel } from "@/components/landing/testimonials-carousel";

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
  alternates: { canonical: "https://vekino.com" },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Vekino",
    title: "Vekino | Plataforma para administrar conjuntos residenciales",
    description:
      "Todo tu conjunto, conectado en un solo lugar. Administración, pagos, visitas, reservas y comunicación en una sola plataforma.",
    url: "https://vekino.com",
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

/**
 * Landing de Vekino.
 *
 * Orden de lectura: promesa → prueba → qué hace → cómo se ve → cuánto cuesta
 * → quién lo dice → dudas → contacto. Cada sección es una pieza independiente
 * en `components/landing/`; el marco punteado y el rayado lateral los pone
 * `PageFrame` una sola vez para toda la página.
 */
export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <div className="landing-main">
        <PageFrame />
        <Header />

        <main>
          {/* El único h1 de la página vive dentro del hero. */}
          <HeroSection />
          <LogoCloud />
          <StatsSection />
          <FeaturesGrid />
          <FeatureAccordion />
          <AppSection />
          <PricingSection />
          <TestimonialsCarousel />
          <FaqSection />
          <CtaSection />
          <ContactSection />
          <NewsletterSection />
        </main>

        <Footer />
      </div>
    </>
  );
}
