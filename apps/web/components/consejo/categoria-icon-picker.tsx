"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import {
  CategoriaIcon,
  COLOR_KEY_STYLES,
  EMOJI_PRESETS,
  LUCIDE_ICON_MAP,
  LUCIDE_ICON_OPTIONS,
  sanitizeSvgMarkup,
  type CategoriaIconType,
} from "./categoria-icon";

export type IconDraft = {
  iconType: CategoriaIconType;
  iconValue: string;
  colorKey: string;
};

const TABS: { id: CategoriaIconType; label: string }[] = [
  { id: "emoji", label: "Emoji" },
  { id: "lucide", label: "Icono" },
  { id: "svg", label: "SVG" },
  { id: "image", label: "Imagen" },
];

export function CategoriaIconPicker({
  value,
  onChange,
  uploadPrefix,
  className,
}: {
  value: IconDraft;
  onChange: (next: IconDraft) => void;
  /** Prefijo S3 para subir imagen, ej. condominios/xxx/consejo/icons */
  uploadPrefix?: string;
  className?: string;
}) {
  const [tab, setTab] = useState<CategoriaIconType>(value.iconType);
  const [svgDraft, setSvgDraft] = useState(
    value.iconType === "svg" ? value.iconValue : "",
  );
  const [svgError, setSvgError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFile = useUploadToS3();

  function selectTab(next: CategoriaIconType) {
    setTab(next);
    setSvgError(null);
    if (next === "emoji" && value.iconType !== "emoji") {
      onChange({ ...value, iconType: "emoji", iconValue: "📁" });
    } else if (next === "lucide" && value.iconType !== "lucide") {
      onChange({
        ...value,
        iconType: "lucide",
        iconValue: "folder",
        colorKey: value.colorKey || "slate",
      });
    } else if (next === "svg") {
      onChange({
        ...value,
        iconType: "svg",
        iconValue: value.iconType === "svg" ? value.iconValue : svgDraft,
      });
    } else if (next === "image" && value.iconType !== "image") {
      onChange({ ...value, iconType: "image", iconValue: "" });
    }
  }

  async function onPickImage(file: File | null) {
    if (!file || !uploadPrefix) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file, uploadPrefix);
      onChange({ iconType: "image", iconValue: url, colorKey: value.colorKey });
      setTab("image");
    } finally {
      setUploading(false);
    }
  }

  function applySvg() {
    try {
      const clean = sanitizeSvgMarkup(svgDraft);
      setSvgError(null);
      onChange({ iconType: "svg", iconValue: clean, colorKey: value.colorKey });
    } catch (e) {
      setSvgError(e instanceof Error ? e.message : "SVG inválido.");
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="group relative shrink-0 rounded-2xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-brand"
          onClick={() => {
            /* preview only — tabs below change icon */
          }}
          aria-label="Vista previa del icono"
        >
          <CategoriaIcon
            data={value}
            size="lg"
            className="transition-transform group-hover:scale-[1.02]"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Icono</p>
          <p className="text-xs text-muted-foreground">
            Como en Notion: emoji, icono, SVG o imagen.
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "emoji" && (
        <div className="space-y-2">
          <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
            {EMOJI_PRESETS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() =>
                  onChange({ ...value, iconType: "emoji", iconValue: e })
                }
                className={cn(
                  "grid h-9 place-items-center rounded-lg text-lg transition-colors hover:bg-accent",
                  value.iconType === "emoji" &&
                    value.iconValue === e &&
                    "bg-brand/10 ring-1 ring-brand/30",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input
            value={value.iconType === "emoji" ? value.iconValue : ""}
            onChange={(e) =>
              onChange({
                ...value,
                iconType: "emoji",
                iconValue: e.target.value.slice(0, 8),
              })
            }
            placeholder="O pega un emoji…"
            className="text-center text-lg"
          />
        </div>
      )}

      {tab === "lucide" && (
        <div className="space-y-3">
          <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8">
            {LUCIDE_ICON_OPTIONS.map((key) => {
              const Icon = LUCIDE_ICON_MAP[key]!;
              const selected =
                value.iconType === "lucide" && value.iconValue === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={key}
                  onClick={() =>
                    onChange({
                      ...value,
                      iconType: "lucide",
                      iconValue: key,
                    })
                  }
                  className={cn(
                    "grid h-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    selected && "bg-brand/10 text-brand ring-1 ring-brand/30",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(COLOR_KEY_STYLES).map((ck) => (
              <button
                key={ck}
                type="button"
                title={ck}
                onClick={() => onChange({ ...value, colorKey: ck })}
                className={cn(
                  "h-7 w-7 rounded-full ring-offset-background transition-transform hover:scale-105",
                  COLOR_KEY_STYLES[ck],
                  value.colorKey === ck && "ring-2 ring-foreground/40",
                )}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "svg" && (
        <div className="space-y-2">
          <Textarea
            value={svgDraft}
            onChange={(e) => setSvgDraft(e.target.value)}
            placeholder={'Pega el código SVG, ej. <svg viewBox="0 0 24 24">…</svg>'}
            rows={5}
            className="font-mono text-xs"
          />
          {svgError ? (
            <p className="text-xs text-destructive">{svgError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Se limpian scripts y atributos peligrosos al guardar.
            </p>
          )}
          <Button type="button" size="sm" variant="outline" onClick={applySvg}>
            Usar este SVG
          </Button>
        </div>
      )}

      {tab === "image" && (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!uploadPrefix || uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            Subir imagen
          </Button>
          <Input
            value={value.iconType === "image" ? value.iconValue : ""}
            onChange={(e) =>
              onChange({
                ...value,
                iconType: "image",
                iconValue: e.target.value.trim(),
              })
            }
            placeholder="O pega una URL de imagen…"
          />
        </div>
      )}
    </div>
  );
}
