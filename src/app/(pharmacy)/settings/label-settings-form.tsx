"use client";

import { ImageUp, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { DispensingSticker, MeasureSticker, Rotated, STICKER_CSS, useStickerFit } from "@/components/dispensing-sticker";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useFormAction } from "@/components/ui/use-form-action";
import { LABEL_PRESETS } from "@/db/schema";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import {
  MAX_LABEL_MM,
  MIN_LABEL_MM,
  labelSize,
  type LabelContent,
  type LabelPreset,
  type StickerWords,
} from "@/lib/label-layout";
import { updateLabelSettings } from "./actions";

const PRESET_LABELS: Record<LabelPreset, MessageKey> = {
  standard: "settings.labelPresetStandard",
  compact: "settings.labelPresetCompact",
  large: "settings.labelPresetLarge",
  xl: "settings.labelPresetXl",
  custom: "settings.labelPresetCustom",
};

const LOGO_SIDE = 240;

/**
 * Turns an uploaded logo into pure black and white (label printers are
 * thermal) and returns it as a small PNG data URL.
 */
async function blackAndWhiteLogo(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LOGO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const lightness = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const v = lightness < 160 ? 0 : 255;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function LabelSettingsForm({
  settings,
  sample,
  words,
}: {
  settings: {
    labelPreset: LabelPreset;
    labelWidthMm: number | null;
    labelHeightMm: number | null;
    labelRotate: boolean;
    labelLogo: string | null;
  };
  /** A sample label with the pharmacy's own name, address and phone. */
  sample: Omit<LabelContent, "logo">;
  words: StickerWords;
}) {
  const t = useT();
  const [preset, setPreset] = useState<LabelPreset>(settings.labelPreset);
  const [width, setWidth] = useState(String(settings.labelWidthMm ?? ""));
  const [height, setHeight] = useState(String(settings.labelHeightMm ?? ""));
  const [rotate, setRotate] = useState(settings.labelRotate);
  const [logo, setLogo] = useState(settings.labelLogo ?? "");
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { onSubmit, onChange, pending, errors } = useFormAction(updateLabelSettings);
  const { fit, onMeasure } = useStickerFit();

  const size = labelSize({
    labelPreset: preset,
    labelWidthMm: Number(width) || null,
    labelHeightMm: Number(height) || null,
    labelRotate: rotate,
  });
  const content: LabelContent = { ...sample, logo: logo || null };

  async function onLogo(file: File | undefined) {
    if (!file) return;
    const result = await blackAndWhiteLogo(file);
    if (!result) setLogoError(t("settings.labelLogoInvalid"));
    else {
      setLogoError(null);
      setLogo(result);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form onSubmit={onSubmit} onChange={onChange} className="grid gap-5 lg:grid-cols-[1fr_auto]">
      <style>{STICKER_CSS}</style>
      <div className="grid content-start gap-4">
        <Field label={t("settings.labelPreset")} htmlFor="label-preset" error={errors.labelPreset}>
          <Select
            id="label-preset"
            name="labelPreset"
            value={preset}
            onChange={(e) => setPreset(e.target.value as LabelPreset)}
          >
            {LABEL_PRESETS.map((p) => (
              <option key={p} value={p}>
                {t(PRESET_LABELS[p])}
              </option>
            ))}
          </Select>
        </Field>
        {preset === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("settings.labelWidth")}
              htmlFor="label-width"
              error={errors.labelWidthMm}
              hint={t("settings.labelSizeHint", {
                min: `${MIN_LABEL_MM.width} × ${MIN_LABEL_MM.height}`,
                max: `${MAX_LABEL_MM.width} × ${MAX_LABEL_MM.height}`,
              })}
            >
              <Input
                id="label-width"
                name="labelWidthMm"
                type="number"
                min={MIN_LABEL_MM.width}
                max={MAX_LABEL_MM.width}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </Field>
            <Field label={t("settings.labelHeight")} htmlFor="label-height" error={errors.labelHeightMm}>
              <Input
                id="label-height"
                name="labelHeightMm"
                type="number"
                min={MIN_LABEL_MM.height}
                max={MAX_LABEL_MM.height}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </Field>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="labelRotate"
            checked={rotate}
            onChange={(e) => setRotate(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="font-medium">{t("settings.labelRotate")}</span>
            <span className="block text-xs text-muted-foreground">{t("settings.labelRotateHint")}</span>
          </span>
        </label>

        <Field label={t("settings.labelLogo")} error={logoError ?? errors.labelLogo} hint={t("settings.labelLogoHint")}>
          <input type="hidden" name="labelLogo" value={logo} />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => void onLogo(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImageUp />
              {logo ? t("settings.labelLogoReplace") : t("settings.labelLogoUpload")}
            </Button>
            {logo && (
              <Button variant="ghost" size="sm" onClick={() => setLogo("")}>
                <Trash2 />
                {t("settings.labelLogoRemove")}
              </Button>
            )}
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link
            href="/settings/label-test"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: "outline" })}
          >
            <Printer />
            {t("settings.labelTestPrint")}
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.labelTestPrintHint")}</p>
      </div>

      <div className="grid content-start justify-items-center gap-2 overflow-x-auto">
        <p className="text-xs font-medium text-muted-foreground">
          {t("settings.labelPreview", { width: size.widthMm, height: size.heightMm })}
        </p>
        <Rotated size={size}>
          <DispensingSticker content={content} size={{ ...size, rotate: false }} words={words} level={fit?.level ?? 0} />
        </Rotated>
        {fit?.overflow && <p className="text-xs text-destructive">{t("dispensing.doesNotFit")}</p>}
        <MeasureSticker content={content} size={size} words={words} onMeasure={onMeasure} />
      </div>
    </form>
  );
}
