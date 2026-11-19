"use client";

import { useCallback, useState } from "react";
import {
  PRESET_SPECS,
  SLOTS,
  hasSlots,
  type LabelContent,
  type LabelSize,
  type Slot,
  type StickerWords,
} from "@/lib/label-layout";

export type { StickerWords };

/*
 * The printed dispensing sticker, from the client's reference design
 * (stockyaa-label-design.html): sizes in mm, type in pt, black on white only,
 * because label printers are thermal and print no grey or colour. The colours
 * here are paper, not theme, so they do not follow dark mode.
 */

/**
 * What may be left out when the content does not fit, in the client's order:
 * 1 logo, 2 + Thai name, 3 + second warning. The legal items never are.
 */
export type DropLevel = 0 | 1 | 2 | 3;

const ICON: Record<Slot, React.ReactNode> = {
  morning: <path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 4v6M9 7l3-3 3 3" />,
  noon: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  evening: <path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 10V4M9 7l3 3 3-3" />,
  bedtime: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
};

export const STICKER_CSS = `
.dl { background: #fff; color: #000; border: 0.2mm solid #000; box-sizing: border-box; overflow: hidden;
  display: flex; flex-direction: column; line-height: 1.25; }
.dl p { margin: 0; }
.dl .hd { display: flex; align-items: center; gap: 1.5mm; border-bottom: 0.3mm solid #000; padding-bottom: 0.8mm; }
.dl .logo { flex: none; width: var(--logo); height: var(--logo); display: flex; align-items: center; justify-content: center; }
.dl .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.dl .hd-text { min-width: 0; }
.dl .shop { font-size: var(--f-shop); font-weight: 700; }
.dl .small { font-size: var(--f-small); }
.dl .name { font-size: var(--f-name); font-weight: 700; }
.dl .txt { font-size: var(--f-txt); }
.dl .dir { font-size: var(--f-dir); font-weight: 700; }
.dl .dir2 { font-size: var(--f-dir2); }
.dl .body { display: flex; flex-direction: column; gap: var(--gap); padding-top: var(--gap); flex: none; }
.dl.cols .body { flex-direction: row; gap: 2mm; }
.dl.cols .who { flex: 0 0 38%; min-width: 0; }
.dl.cols .how { flex: 1; min-width: 0; }
.dl.stack .how { border-top: 0.2mm solid #000; padding-top: var(--gap); }
.dl .who .row { display: flex; justify-content: space-between; gap: 2mm; }
.dl.cols .who .row { display: block; }
.dl .clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dl .slots { display: flex; gap: 1mm; margin-top: 1mm; }
.dl .slot { flex: 1; min-width: 0; border: 0.3mm solid #000; border-radius: 1mm; text-align: center; padding: 0.4mm 0; }
.dl .slot.off { border: 0.2mm dashed #000; }
.dl .slot svg { width: var(--icon); height: var(--icon); display: block; margin: 0 auto; }
.dl .slot span { display: block; font-size: var(--f-slot); }
.dl .slot b { display: block; font-size: var(--f-num); font-weight: 700; }
.dl .slot.inline { display: flex; justify-content: center; align-items: center; gap: 1.2mm; padding: 0.6mm 0; }
.dl .warn { font-size: var(--f-small); padding-top: var(--gap); }
.dl .ft { margin-top: auto; border-top: 0.3mm solid #000; padding-top: 0.8mm; display: flex; align-items: flex-end; gap: 1.5mm; font-size: var(--f-small); }
.dl .ft .line { flex: 1; min-width: 8mm; height: 3mm; border-bottom: 0.2mm solid #000; }
.dl.standard { padding: 2mm 2.5mm; --logo: 6mm; --gap: 0.8mm; --icon: 3mm;
  --f-shop: 8pt; --f-small: 6.5pt; --f-name: 8pt; --f-txt: 7pt; --f-dir: 9.5pt; --f-dir2: 8pt; --f-slot: 6pt; --f-num: 9pt; }
.dl.compact { padding: 2mm 2.5mm; --logo: 0mm; --gap: 0.8mm; --icon: 0mm;
  --f-shop: 8pt; --f-small: 6.5pt; --f-name: 8pt; --f-txt: 7pt; --f-dir: 10pt; --f-dir2: 8pt; --f-slot: 7pt; --f-num: 8.5pt; }
.dl.large { padding: 3mm; --logo: 9mm; --gap: 1.4mm; --icon: 4.5mm;
  --f-shop: 10pt; --f-small: 7.5pt; --f-name: 10pt; --f-txt: 8.5pt; --f-dir: 13pt; --f-dir2: 10pt; --f-slot: 7.5pt; --f-num: 12pt; }
.dl.xl { padding: 3mm 3.5mm; --logo: 9mm; --gap: 1.1mm; --icon: 4mm;
  --f-shop: 10.5pt; --f-small: 8pt; --f-name: 10.5pt; --f-txt: 9pt; --f-dir: 14pt; --f-dir2: 10.5pt; --f-slot: 8pt; --f-num: 11pt; }
@media print { .dl { border: none; } }
`;

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** One sticker at true size. `warningsOnly` prints the second sticker for warnings that did not fit. */
export function DispensingSticker({
  content,
  size,
  words,
  level = 0,
  warningsOnly = false,
  labelRef,
}: {
  content: LabelContent;
  size: LabelSize;
  words: StickerWords;
  level?: DropLevel;
  warningsOnly?: boolean;
  labelRef?: React.Ref<HTMLDivElement>;
}) {
  const spec = PRESET_SPECS[size.layout];
  const showLogo = spec.logo && !!content.logo && level < 1;
  const showThai = spec.thaiName && content.language === "th" && !!content.thaiName && level < 2;
  const warnings = level >= 3 ? content.warnings.slice(0, 1) : content.warnings;
  const [main = "", ...rest] = lines(content.directions);
  const slots = content.slots;
  const header = (
    <div className="hd">
      {showLogo && (
        <div className="logo">
          {/* A data URL made at upload; next/image adds nothing for it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={content.logo!} alt="" />
        </div>
      )}
      <div className="hd-text">
        <p className="shop">{content.pharmacyName}</p>
        <p className="small">{[content.pharmacyAddress, content.pharmacyPhone].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
  const drug = (
    <p className="name clamp2" data-clamp>
      {content.drugName} {content.noStrength ? "" : content.strength}
      {showThai && <span style={{ fontWeight: 400 }}> ({content.thaiName})</span>}
    </p>
  );
  const footer = (
    <div className="ft">
      <span>
        {content.pharmacistName} {words.licensePrefix}
        {content.pharmacistLicense} {words.signature}
      </span>
      <span className="line" />
    </div>
  );

  return (
    <div
      ref={labelRef}
      className={`dl ${size.layout} ${spec.columns && !warningsOnly ? "cols" : "stack"}`}
      style={{ width: `${size.widthMm}mm`, height: `${size.heightMm}mm` }}
    >
      {header}
      {warningsOnly ? (
        <div className="body">
          <div className="who">
            <div className="row">
              <p className="name">{content.patientName}</p>
              <p className="small">{content.date}</p>
            </div>
            {drug}
          </div>
          <div className="warn">
            {warnings.map((w, i) => (
              <p key={i}>⚠ {w.text}</p>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="body">
            <div className="who">
              <div className="row">
                <p className="name">{content.patientName}</p>
                <p className="small">{content.date}</p>
              </div>
              {drug}
              <p className="small">
                {words.quantity} {content.quantity}
              </p>
              <p className="txt clamp2" data-clamp>
                {words.usedFor} {content.indication}
              </p>
            </div>
            <div className="how">
              <p className="dir">{main}</p>
              {rest.map((line, i) => (
                <p key={i} className="dir2">
                  {line}
                </p>
              ))}
              {hasSlots(slots) && (
                <div className="slots">
                  {SLOTS.map((slot) => {
                    const n = slots[slot] || null;
                    // Without icons (compact) only the used slots are drawn.
                    if (n === null && !spec.icons) return null;
                    return (
                      <div key={slot} className={`slot${n === null ? " off" : ""}${spec.icons ? "" : " inline"}`}>
                        {spec.icons && (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#000"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            {ICON[slot]}
                          </svg>
                        )}
                        <span>{words.slots[slot]}</span>
                        <b>{n ?? "–"}</b>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {warnings.length > 0 && (
            <div className="warn">
              {warnings.map((w, i) => (
                <p key={i}>⚠ {w.text}</p>
              ))}
            </div>
          )}
        </>
      )}
      {footer}
    </div>
  );
}

/** A sticker turned 90 degrees, for printers fed a narrow roll. */
export function Rotated({ size, children }: { size: LabelSize; children: React.ReactNode }) {
  if (!size.rotate) return <>{children}</>;
  return (
    <div style={{ width: `${size.heightMm}mm`, height: `${size.widthMm}mm`, overflow: "hidden" }}>
      <div
        style={{
          width: `${size.widthMm}mm`,
          height: `${size.heightMm}mm`,
          transform: "rotate(90deg) translateY(-100%)",
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** True when the label's content runs past its edges or a two-line field is cut. */
function overflows(label: HTMLElement): boolean {
  if (label.scrollHeight > label.clientHeight + 1 || label.scrollWidth > label.clientWidth + 1) return true;
  const body = label.querySelector<HTMLElement>(".body");
  const footer = label.querySelector<HTMLElement>(".ft");
  if (body && footer && body.getBoundingClientRect().bottom > footer.getBoundingClientRect().top + 0.5) return true;
  const warn = label.querySelector<HTMLElement>(".warn");
  if (warn && footer && warn.getBoundingClientRect().bottom > footer.getBoundingClientRect().top + 0.5) return true;
  // A clamped field reads a few pixels taller than its box even when it fits
  // (font metrics); a cut-off line adds a whole line height.
  return [...label.querySelectorAll<HTMLElement>("[data-clamp]")].some((el) => {
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 12;
    return el.scrollHeight > el.clientHeight + lineHeight / 2;
  });
}

export type Fit = { level: DropLevel; overflow: boolean };
export type FitResults = Partial<Record<DropLevel, boolean>>;
const LEVELS: DropLevel[] = [0, 1, 2, 3];

/**
 * The first drop level at which everything fits, or null until all levels are
 * measured. `overflow` stays true when even the last level does not fit, and
 * printing must then be blocked.
 */
export function fitFrom(results: FitResults | undefined): Fit | null {
  if (!results || !LEVELS.every((l) => results[l] !== undefined)) return null;
  const first = LEVELS.find((l) => results[l] === false);
  return { level: first ?? 3, overflow: first === undefined };
}

/**
 * Hidden copies of the sticker at each drop level, measured after layout and
 * whenever their size or the content changes. `onMeasure` should be stable.
 */
export function MeasureSticker({
  content,
  size,
  words,
  onMeasure,
}: {
  content: LabelContent;
  size: LabelSize;
  words: StickerWords;
  onMeasure: (level: DropLevel, overflow: boolean) => void;
}) {
  const contentKey = JSON.stringify(content);
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, visibility: "hidden", pointerEvents: "none" }}>
      {LEVELS.map((level) => (
        <MeasuredCopy
          key={level}
          level={level}
          contentKey={contentKey}
          onMeasure={onMeasure}
          content={content}
          size={size}
          words={words}
        />
      ))}
    </div>
  );
}

function MeasuredCopy({
  level,
  contentKey,
  onMeasure,
  content,
  size,
  words,
}: {
  level: DropLevel;
  contentKey: string;
  onMeasure: (level: DropLevel, overflow: boolean) => void;
  content: LabelContent;
  size: LabelSize;
  words: StickerWords;
}) {
  // A new ref callback when the content changes, so it is measured again.
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const measure = () => onMeasure(level, overflows(el));
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      el.querySelectorAll(".body, .warn").forEach((child) => observer.observe(child));
      void document.fonts?.ready.then(measure);
      measure();
      return () => observer.disconnect();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contentKey re-measures on any change
    [level, onMeasure, contentKey, size.layout, size.widthMm, size.heightMm],
  );
  return <DispensingSticker content={content} size={{ ...size, rotate: false }} words={words} level={level} labelRef={ref} />;
}

/** Measures one sticker on its own (the settings preview). */
export function useStickerFit() {
  const [results, setResults] = useState<FitResults>({});
  const onMeasure = useCallback((level: DropLevel, overflow: boolean) => {
    setResults((r) => (r[level] === overflow ? r : { ...r, [level]: overflow }));
  }, []);
  return { fit: fitFrom(results), onMeasure };
}
