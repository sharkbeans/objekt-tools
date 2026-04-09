import { forwardRef, useState, useRef, useEffect } from "react";
import type { ResolvedPosterItem } from "@/lib/poster-resolver";
import { getSeasonPrefix } from "@/lib/season-prefix";

export type PosterTheme = "dark" | "light";

export interface PosterData {
  username: string;
  cosmoId: string;
  haves: ResolvedPosterItem[];
  wants: ResolvedPosterItem[];
  notes?: string;
  date: string;
  haveTitle: string;
  wantTitle: string;
}

interface PosterCanvasProps {
  data: PosterData;
  theme: PosterTheme;
  editable?: boolean;
  onTextChange?: (field: keyof PosterData | `haveLabel:${number}` | `wantLabel:${number}`, value: string) => void;
  onRemoveItem?: (section: "have" | "want", index: number) => void;
}

function getGridCols(count: number): number {
  if (count <= 8) return 4;
  if (count <= 15) return 5;
  return 6;
}

const darkTheme = {
  bg: "#0f0f14",
  fg: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  sectionBg: "#18181b",
  accent: "#71717a",
  headerBg: "#18181b",
};

const lightTheme = {
  bg: "#ffffff",
  fg: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  sectionBg: "#f4f4f5",
  accent: "#d4d4d8",
  headerBg: "#f4f4f5",
};

// ── Inline editable text ──────────────────────────────────────────────────

function InlineEdit({
  value,
  onChange,
  editable,
  style,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  style: React.CSSProperties;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!editable || !editing) {
    return (
      <div
        onClick={editable ? () => setEditing(true) : undefined}
        style={{
          ...style,
          cursor: editable ? "pointer" : "default",
          borderBottom: editable ? "1px dashed transparent" : undefined,
          minWidth: 20,
        }}
        onMouseEnter={(e) => {
          if (editable) (e.currentTarget as HTMLDivElement).style.borderBottomColor = style.color as string ?? "#888";
        }}
        onMouseLeave={(e) => {
          if (editable) (e.currentTarget as HTMLDivElement).style.borderBottomColor = "transparent";
        }}
      >
        {value || "\u00A0"}
      </div>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  const baseInputStyle: React.CSSProperties = {
    ...style,
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${style.color ?? "#888"}`,
    outline: "none",
    padding: 0,
    margin: 0,
    width: "100%",
    fontFamily: "inherit",
  };

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Escape") commit(); }}
        style={{ ...baseInputStyle, resize: "none", minHeight: 40 }}
        rows={3}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commit(); }}
      style={baseInputStyle}
    />
  );
}

// ── Item card ─────────────────────────────────────────────────────────────

function ItemCard({
  item,
  theme,
  cardWidth,
  editable,
  onRemove,
  onLabelChange,
  label,
}: {
  item: ResolvedPosterItem;
  theme: typeof darkTheme;
  cardWidth: number;
  editable: boolean;
  onRemove?: () => void;
  onLabelChange?: (v: string) => void;
  label: string;
}) {
  const quantity = item.parsed.quantity;

  return (
    <div
      style={{
        width: cardWidth,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        position: "relative",
      }}
      className={editable ? "group" : undefined}
    >
      {/* Card image */}
      <div style={{ position: "relative", width: cardWidth }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={label}
            crossOrigin="anonymous"
            style={{
              width: cardWidth,
              aspectRatio: "2 / 3",
              objectFit: "cover",
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: cardWidth,
              aspectRatio: "2 / 3",
              borderRadius: 6,
              border: `1px dashed ${theme.accent}`,
              backgroundColor: theme.sectionBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: theme.muted,
                textAlign: "center",
                wordBreak: "break-word",
              }}
            >
              {item.parsed.raw}
            </span>
          </div>
        )}

        {/* Quantity badge — bottom left */}
        {quantity && quantity > 1 && (
          <div
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
              width: 22,
              height: 22,
              borderRadius: "50%",
              backgroundColor: "#000000",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid rgba(255,255,255,0.3)",
            }}
          >
            {quantity}
          </div>
        )}

        {/* X remove button — visible on hover (desktop) or always (mobile via group) */}
        {editable && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 md:opacity-0 max-md:opacity-100 transition-opacity"
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: "rgba(220, 38, 38, 0.9)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
            }}
          >
            &times;
          </button>
        )}
      </div>

      {/* Label */}
      <InlineEdit
        value={label}
        onChange={(v) => onLabelChange?.(v)}
        editable={editable}
        style={{
          fontSize: 10,
          color: theme.muted,
          textAlign: "center",
          maxWidth: cardWidth,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: "1.3",
        }}
      />
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────

function Section({
  title,
  items,
  theme,
  sectionKey,
  editable,
  onTitleChange,
  onRemoveItem,
  onLabelChange,
  labels,
}: {
  title: string;
  items: ResolvedPosterItem[];
  theme: typeof darkTheme;
  sectionKey: "have" | "want";
  editable: boolean;
  onTitleChange?: (v: string) => void;
  onRemoveItem?: (section: "have" | "want", index: number) => void;
  onLabelChange?: (field: string, value: string) => void;
  labels: string[];
}) {
  if (items.length === 0) return null;

  const cols = getGridCols(items.length);
  const cardWidth = 100;
  const gap = 10;
  const gridWidth = cols * cardWidth + (cols - 1) * gap;

  return (
    <div style={{ width: "100%" }}>
      <InlineEdit
        value={title}
        onChange={(v) => onTitleChange?.(v)}
        editable={editable}
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: theme.fg,
          letterSpacing: 1.5,
          textTransform: "uppercase" as const,
          marginBottom: 10,
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${cardWidth}px)`,
          gap,
          width: gridWidth,
        }}
      >
        {items.map((item, i) => (
          <ItemCard
            key={i}
            item={item}
            theme={theme}
            cardWidth={cardWidth}
            editable={editable}
            onRemove={() => onRemoveItem?.(sectionKey, i)}
            onLabelChange={(v) => onLabelChange?.(`${sectionKey}Label:${i}`, v)}
            label={labels[i] ?? item.parsed.raw}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main canvas ───────────────────────────────────────────────────────────

export const PosterCanvas = forwardRef<HTMLDivElement, PosterCanvasProps>(
  function PosterCanvas({ data, theme: themeName, editable = false, onTextChange, onRemoveItem }, ref) {
    const theme = themeName === "dark" ? darkTheme : lightTheme;

    const maxCols = Math.max(
      getGridCols(data.haves.length),
      getGridCols(data.wants.length),
      4,
    );
    const cardWidth = 100;
    const gap = 10;
    const padding = 32;
    const posterWidth = maxCols * cardWidth + (maxCols - 1) * gap + padding * 2;

    const haveLabels = data.haves.map((item) =>
      item.entry
        ? `${item.entry.member} ${getSeasonPrefix(item.entry.season)}${item.entry.collectionNo}`
        : item.parsed.raw,
    );
    const wantLabels = data.wants.map((item) =>
      item.entry
        ? `${item.entry.member} ${getSeasonPrefix(item.entry.season)}${item.entry.collectionNo}`
        : item.parsed.raw,
    );

    const disclaimerText = data.cosmoId
      ? `Users self-claim what they have. Please verify at objekt.top/@${data.cosmoId}`
      : "Users self-claim what they have.";

    return (
      <div
        ref={ref}
        style={{
          width: posterWidth,
          backgroundColor: theme.bg,
          color: theme.fg,
          fontFamily: "Helvetica, 'Helvetica Neue', Arial, sans-serif",
          padding,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div>
            {data.username && (
              <InlineEdit
                value={data.username}
                onChange={(v) => onTextChange?.("username", v)}
                editable={editable}
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: theme.fg,
                  marginBottom: 2,
                }}
              />
            )}
            <div style={{ fontSize: 11, color: theme.muted }}>{data.date}</div>
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: theme.accent,
              letterSpacing: 0.5,
            }}
          >
            objekt.my
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: theme.border }} />

        {/* Have section */}
        <Section
          title={data.haveTitle}
          items={data.haves}
          theme={theme}
          sectionKey="have"
          editable={editable}
          onTitleChange={(v) => onTextChange?.("haveTitle", v)}
          onRemoveItem={onRemoveItem}
          onLabelChange={(field, value) => onTextChange?.(field as `haveLabel:${number}`, value)}
          labels={haveLabels}
        />

        {/* Want section */}
        {data.wants.length > 0 && data.haves.length > 0 && (
          <div style={{ height: 1, backgroundColor: theme.border }} />
        )}
        <Section
          title={data.wantTitle}
          items={data.wants}
          theme={theme}
          sectionKey="want"
          editable={editable}
          onTitleChange={(v) => onTextChange?.("wantTitle", v)}
          onRemoveItem={onRemoveItem}
          onLabelChange={(field, value) => onTextChange?.(field as `wantLabel:${number}`, value)}
          labels={wantLabels}
        />

        {/* Notes */}
        {data.notes && (
          <>
            <div style={{ height: 1, backgroundColor: theme.border }} />
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.muted,
                  letterSpacing: 1,
                  textTransform: "uppercase" as const,
                  marginBottom: 6,
                }}
              >
                Notes
              </div>
              <InlineEdit
                value={data.notes}
                onChange={(v) => onTextChange?.("notes", v)}
                editable={editable}
                multiline
                style={{
                  fontSize: 12,
                  color: theme.muted,
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                }}
              />
            </div>
          </>
        )}

        {/* Disclaimer */}
        <div
          style={{
            fontSize: 12,
            color: theme.muted,
            textAlign: "center" as const,
            lineHeight: "1.4",
            paddingTop: 4,
          }}
        >
          {disclaimerText}
        </div>

        {/* Footer watermark */}
        <div
          style={{
            textAlign: "center" as const,
            fontSize: 11,
            color: theme.accent,
            paddingTop: 0,
          }}
        >
          Generated from objekt.my
        </div>
      </div>
    );
  },
);
