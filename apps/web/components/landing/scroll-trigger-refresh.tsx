"use client";

import { useEffect } from "react";
import { refreshScrollTriggerWhenReady } from "@/lib/gsap";

/** Recalcula las medidas de ScrollTrigger cuando cargan fuentes e imágenes. */
export function ScrollTriggerRefresh() {
  useEffect(() => {
    refreshScrollTriggerWhenReady();
  }, []);
  return null;
}
