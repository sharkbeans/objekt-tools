import { forwardRef, useEffect, useRef, useState } from "react";
import { getItemQuantity, getNumberGroupKey } from "@/lib/poster-item-grouping";
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
  groupByMember?: boolean;
  groupByNumbers?: boolean;
  colsPerRow?: number;
  onTextChange?: (
    field: keyof PosterData | `haveLabel:${number}` | `wantLabel:${number}`,
    value: string,
  ) => void;
  onRemoveItem?: (section: "have" | "want", index: number) => void;
  onAddItem?: (section: "have" | "want") => void;
  onAddCustomWant?: () => void;
}

interface MemberGroup {
  member: string | null;
  items: ResolvedPosterItem[];
  indices: number[];
}

interface DisplayItem {
  item: ResolvedPosterItem;
  index: number;
  quantity: number;
}

function getDisplayItems(
  items: ResolvedPosterItem[],
  groupByNumbers: boolean,
): DisplayItem[] {
  if (!groupByNumbers) {
    return items.map((item, index) => ({
      item,
      index,
      quantity: getItemQuantity(item),
    }));
  }

  const grouped: DisplayItem[] = [];
  const seen = new Map<string, DisplayItem>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = getNumberGroupKey(item);
    const existing = seen.get(key);
    if (existing) {
      existing.quantity += getItemQuantity(item);
    } else {
      const displayItem = { item, index, quantity: getItemQuantity(item) };
      grouped.push(displayItem);
      seen.set(key, displayItem);
    }
  }

  return grouped;
}

function groupItemsByMember(items: ResolvedPosterItem[]): MemberGroup[] {
  const groups: MemberGroup[] = [];
  const seen = new Map<string, MemberGroup>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const m = item.entry?.member ?? item.parsed.member ?? null;
    const key = m ?? "\0any";
    let group = seen.get(key);
    if (!group) {
      group = { member: m, items: [], indices: [] };
      groups.push(group);
      seen.set(key, group);
    }
    group.items.push(item);
    group.indices.push(i);
  }
  return groups;
}

function groupDisplayItemsByMember(items: DisplayItem[]) {
  const groups: { member: string | null; items: DisplayItem[] }[] = [];
  const seen = new Map<string, (typeof groups)[0]>();

  for (const item of items) {
    const member = item.item.entry?.member ?? item.item.parsed.member ?? null;
    const key = member ?? "\0any";
    let group = seen.get(key);
    if (!group) {
      group = { member, items: [] };
      groups.push(group);
      seen.set(key, group);
    }
    group.items.push(item);
  }

  return groups;
}

export function getGridCols(count: number): number {
  return Math.min(10, Math.max(3, Math.ceil(Math.sqrt(count * 1.5))));
}

export function getDisplayCount(
  items: ResolvedPosterItem[],
  groupByNumbers: boolean,
): number {
  return getDisplayItems(items, groupByNumbers).length;
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
          if (editable)
            (e.currentTarget as HTMLDivElement).style.borderBottomColor =
              (style.color as string) ?? "#888";
        }}
        onMouseLeave={(e) => {
          if (editable)
            (e.currentTarget as HTMLDivElement).style.borderBottomColor =
              "transparent";
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
        onKeyDown={(e) => {
          if (e.key === "Escape") commit();
        }}
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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") commit();
      }}
      style={baseInputStyle}
    />
  );
}

// ── Item card ─────────────────────────────────────────────────────────────

function ItemCard({
  item,
  theme,
  cardWidth,
  cardHeight,
  editable,
  onRemove,
  onLabelChange,
  label,
  seasonNumber,
  displayQuantity,
  showSerial,
}: {
  item: ResolvedPosterItem;
  theme: typeof darkTheme;
  cardWidth: number;
  cardHeight: number;
  editable: boolean;
  onRemove?: () => void;
  onLabelChange?: (v: string) => void;
  label: string;
  seasonNumber?: string;
  displayQuantity?: number;
  showSerial: boolean;
}) {
  const quantity = displayQuantity ?? item.parsed.quantity;
  const serial = showSerial ? item.parsed.serial : undefined;
  const isFreeform = item.parsed.freeform === true;

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
            style={{
              width: cardWidth,
              height: cardHeight,
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
              height: cardHeight,
              borderRadius: 6,
              border: `1px dashed ${theme.accent}`,
              backgroundColor: theme.sectionBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isFreeform ? 14 : 4,
            }}
          >
            <span
              style={{
                fontSize: isFreeform ? 15 : 10,
                fontWeight: isFreeform ? 700 : 400,
                color: theme.muted,
                opacity: isFreeform ? 0.95 : 1,
                textAlign: "center",
                wordBreak: "break-word",
                lineHeight: "1.3",
              }}
            >
              {item.parsed.raw}
            </span>
          </div>
        )}

        {/* Serial badge — top left */}
        {serial && (
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              backgroundColor: "rgba(0,0,0,0.6)",
              color: "#fff",
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              fontFamily: "monospace",
              lineHeight: "1.2",
            }}
          >
            #{serial}
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

      {/* Label - objekt name */}
      {!isFreeform && (
        <InlineEdit
          value={label}
          onChange={(v) => onLabelChange?.(v)}
          editable={editable}
          style={{
            fontSize: 12,
            color: theme.fg,
            textAlign: "center",
            maxWidth: cardWidth,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: "1.3",
          }}
        />
      )}
      {/* Label - season + number */}
      {!isFreeform && (
        <InlineEdit
          value={seasonNumber ?? ""}
          onChange={(v) => onLabelChange?.(v)}
          editable={editable}
          style={{
            fontSize: 11,
            color: theme.muted,
            textAlign: "center",
            maxWidth: cardWidth,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: "1.3",
          }}
        />
      )}
    </div>
  );
}

// ── Add card skeleton ─────────────────────────────────────────────────────

function AddCard({
  theme,
  cardWidth,
  cardHeight,
  onAdd,
}: {
  theme: typeof darkTheme;
  cardWidth: number;
  cardHeight: number;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        width: cardWidth,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <button
        type="button"
        onClick={onAdd}
        style={{
          width: cardWidth,
          height: cardHeight,
          borderRadius: 6,
          border: `2.5px dashed ${theme.fg}`,
          opacity: 0.45,
          backgroundColor: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: theme.fg,
          fontSize: 28,
          fontWeight: 400,
          lineHeight: 1,
          padding: 0,
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.45";
        }}
        aria-label="Add objekt"
      >
        +
      </button>
    </div>
  );
}

function AddCustomWantCard({
  theme,
  cardWidth,
  cardHeight,
  onAdd,
}: {
  theme: typeof darkTheme;
  cardWidth: number;
  cardHeight: number;
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        width: cardWidth * 2 + 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <button
        type="button"
        onClick={onAdd}
        style={{
          width: cardWidth * 2 + 10,
          height: cardHeight,
          borderRadius: 6,
          border: `2.5px dashed ${theme.accent}`,
          opacity: 0.45,
          backgroundColor: "transparent",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: theme.accent,
          gap: 4,
          padding: 0,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.45";
        }}
        aria-label="Add custom want"
      >
        <span style={{ fontSize: 22, fontWeight: 400, lineHeight: 1 }}>+</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase" as const,
          }}
        >
          Custom Want
        </span>
      </button>
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
  groupByMember,
  groupByNumbers,
  colsPerRow,
  onTitleChange,
  onRemoveItem,
  onLabelChange,
  onAddItem,
  onAddCustomWant,
  labels,
  seasonNumbers,
}: {
  title: string;
  items: ResolvedPosterItem[];
  theme: typeof darkTheme;
  sectionKey: "have" | "want";
  editable: boolean;
  groupByMember?: boolean;
  groupByNumbers?: boolean;
  colsPerRow: number;
  onTitleChange?: (v: string) => void;
  onRemoveItem?: (section: "have" | "want", index: number) => void;
  onLabelChange?: (field: string, value: string) => void;
  onAddItem?: (section: "have" | "want") => void;
  onAddCustomWant?: () => void;
  labels: string[];
  seasonNumbers: string[];
}) {
  if (items.length === 0 && !editable) return null;

  const cardWidth = 100;
  const cardHeight = Math.round(cardWidth * 1.5);
  const gap = 10;
  const displayItems = getDisplayItems(items, groupByNumbers ?? false);

  const sectionTitle = (
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
  );

  if (groupByMember) {
    const groupedDisplayItems = groupDisplayItemsByMember(displayItems);
    return (
      <div style={{ width: "100%" }}>
        {sectionTitle}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groupedDisplayItems.map((group) => (
            <div key={group.member ?? "\0any"}>
              {group.member && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: theme.muted,
                    marginBottom: 6,
                    textTransform: "uppercase" as const,
                    letterSpacing: 0.8,
                  }}
                >
                  {group.member}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap }}>
                {group.items.map((display) => {
                  const flatIdx = display.index;
                  const item = display.item;
                  const itemWidth = item.parsed.freeform
                    ? cardWidth * 2 + gap
                    : cardWidth;
                  return (
                    <ItemCard
                      key={flatIdx}
                      item={item}
                      theme={theme}
                      cardWidth={itemWidth}
                      cardHeight={cardHeight}
                      editable={editable}
                      onRemove={() => onRemoveItem?.(sectionKey, flatIdx)}
                      onLabelChange={(v) =>
                        onLabelChange?.(`${sectionKey}Label:${flatIdx}`, v)
                      }
                      label={labels[flatIdx] ?? item.parsed.raw}
                      seasonNumber={seasonNumbers[flatIdx]}
                      displayQuantity={display.quantity}
                      showSerial={!groupByNumbers}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {editable && onAddItem && (
            <div style={{ display: "flex", flexWrap: "wrap", gap }}>
              <AddCard
                theme={theme}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                onAdd={() => onAddItem(sectionKey)}
              />
              {sectionKey === "want" && onAddCustomWant && (
                <AddCustomWantCard
                  theme={theme}
                  cardWidth={cardWidth}
                  cardHeight={cardHeight}
                  onAdd={onAddCustomWant}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const cols = colsPerRow;
  const gridWidth = cols * cardWidth + (cols - 1) * gap;

  return (
    <div style={{ width: "100%" }}>
      {sectionTitle}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${cardWidth}px)`,
          gap,
          width: gridWidth,
        }}
      >
        {displayItems.map((display) => {
          const itemWidth = display.item.parsed.freeform
            ? cardWidth * 2 + gap
            : cardWidth;
          return (
            <div
              key={display.index}
              style={{
                gridColumn: display.item.parsed.freeform ? "span 2" : undefined,
              }}
            >
              <ItemCard
                item={display.item}
                theme={theme}
                cardWidth={itemWidth}
                cardHeight={cardHeight}
                editable={editable}
                onRemove={() => onRemoveItem?.(sectionKey, display.index)}
                onLabelChange={(v) =>
                  onLabelChange?.(`${sectionKey}Label:${display.index}`, v)
                }
                label={labels[display.index] ?? display.item.parsed.raw}
                seasonNumber={seasonNumbers[display.index]}
                displayQuantity={display.quantity}
                showSerial={!groupByNumbers}
              />
            </div>
          );
        })}
        {editable && onAddItem && (
          <AddCard
            theme={theme}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            onAdd={() => onAddItem(sectionKey)}
          />
        )}
        {editable && sectionKey === "want" && onAddCustomWant && (
          <div style={{ gridColumn: "span 2" }}>
            <AddCustomWantCard
              theme={theme}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              onAdd={onAddCustomWant}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main canvas ───────────────────────────────────────────────────────────

export const PosterCanvas = forwardRef<HTMLDivElement, PosterCanvasProps>(
  function PosterCanvas(
    {
      data,
      theme: themeName,
      editable = false,
      groupByMember = false,
      groupByNumbers = false,
      colsPerRow,
      onTextChange,
      onRemoveItem,
      onAddItem,
      onAddCustomWant,
    },
    ref,
  ) {
    const theme = themeName === "dark" ? darkTheme : lightTheme;

    const cardWidth = 100;
    const gap = 10;
    const padding = 32;

    let maxCols: number;
    if (colsPerRow) {
      maxCols = colsPerRow;
    } else if (groupByMember) {
      const haveGroups = groupItemsByMember(
        getDisplayItems(data.haves, groupByNumbers).map(
          (display) => display.item,
        ),
      );
      const wantGroups = groupItemsByMember(
        getDisplayItems(data.wants, groupByNumbers).map(
          (display) => display.item,
        ),
      );
      const maxGroupSize = Math.max(
        ...haveGroups.map((g) => g.items.length),
        ...wantGroups.map((g) => g.items.length),
        4,
      );
      maxCols = Math.min(maxGroupSize, 12);
    } else {
      maxCols = Math.max(
        getGridCols(getDisplayItems(data.haves, groupByNumbers).length),
        getGridCols(getDisplayItems(data.wants, groupByNumbers).length),
        4,
      );
    }

    const posterWidth = maxCols * cardWidth + (maxCols - 1) * gap + padding * 2;

    const haveLabels = data.haves.map(
      (item) => item.entry?.member ?? item.parsed.raw,
    );
    const haveSeasonNumbers = data.haves.map((item) =>
      item.entry
        ? `${getSeasonPrefix(item.entry.season)}${item.entry.collectionNo}`
        : "",
    );
    const wantLabels = data.wants.map(
      (item) => item.entry?.member ?? item.parsed.raw,
    );
    const wantSeasonNumbers = data.wants.map((item) =>
      item.entry
        ? `${getSeasonPrefix(item.entry.season)}${item.entry.collectionNo}`
        : "",
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
          groupByMember={groupByMember}
          groupByNumbers={groupByNumbers}
          colsPerRow={maxCols}
          onTitleChange={(v) => onTextChange?.("haveTitle", v)}
          onRemoveItem={onRemoveItem}
          onAddItem={onAddItem}
          onLabelChange={(field, value) =>
            onTextChange?.(field as `haveLabel:${number}`, value)
          }
          labels={haveLabels}
          seasonNumbers={haveSeasonNumbers}
        />

        {/* Want section */}
        <div style={{ height: 1, backgroundColor: theme.border }} />
        <Section
          title={data.wantTitle}
          items={data.wants}
          theme={theme}
          sectionKey="want"
          editable={editable}
          groupByMember={groupByMember}
          groupByNumbers={groupByNumbers}
          colsPerRow={maxCols}
          onTitleChange={(v) => onTextChange?.("wantTitle", v)}
          onRemoveItem={onRemoveItem}
          onAddItem={onAddItem}
          onAddCustomWant={onAddCustomWant}
          onLabelChange={(field, value) =>
            onTextChange?.(field as `wantLabel:${number}`, value)
          }
          labels={wantLabels}
          seasonNumbers={wantSeasonNumbers}
        />

        {/* Notes */}
        {data.notes && (
          <>
            <div style={{ height: 1, backgroundColor: theme.border }} />
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: theme.fg,
                  letterSpacing: 1.5,
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
                  fontSize: 14,
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
