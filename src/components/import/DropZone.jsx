import clsx from 'clsx';

// Border/background per visual state. Literal rgba values match the design
// handoff's status table exactly (docs/design_handoff_night_sky_redesign,
// section 5, item 5) rather than being derived from a shared token.
const ZONE_STYLES = {
  empty: 'border border-dashed border-[rgba(236,234,244,.14)] bg-[rgba(236,234,244,.018)]',
  selected: 'border border-dashed border-[rgba(231,155,187,.45)] bg-[rgba(231,155,187,.04)]',
  success: 'border border-solid border-[rgba(76,154,255,.38)] bg-[rgba(76,154,255,.045)]',
  error: 'border border-dashed border-[rgba(201,96,96,.42)] bg-[rgba(201,96,96,.045)]',
};

// Left-hand file mark: symbol + theme color per state. "selected" (a file
// is chosen but not yet uploaded) reuses accent pink since that's this
// state's color everywhere else in the zone.
const MARK_CONFIG = {
  selected: { symbol: '·csv', color: '#e79bbb' },
  success: { symbol: '✓', color: '#4c9aff' },
  error: { symbol: '!', color: '#c96060' },
};

const formatKB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Drag-and-drop / click-to-browse CSV picker.
 *
 * The hidden <input type="file"> and its ref are owned by the parent
 * (CsvUpload) so the upload button's "다른 파일 선택" label can reopen the
 * same picker without this component knowing that button exists.
 *
 * Accessibility: once a file is selected, the zone drops its
 * `role="button"`/`tabIndex` so the visible "✕" remove button is the
 * only focusable control here — a real <button> never ends up nested
 * inside another interactive element. Removing the file returns the zone
 * to the empty state, where it becomes keyboard-operable again.
 */
const DropZone = ({ status, file, inputRef, onFileSelect, onZoneClick, onRemoveFile }) => {
  const isEmpty = status === 'empty';
  const mark = MARK_CONFIG[status];

  const handleKeyDown = (e) => {
    if (!isEmpty) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onZoneClick();
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    onFileSelect(e.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div
      onClick={onZoneClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      role={isEmpty ? 'button' : undefined}
      tabIndex={isEmpty ? 0 : undefined}
      onKeyDown={handleKeyDown}
      aria-label={isEmpty ? 'CSV 파일 선택' : undefined}
      className={clsx(
        'flex min-h-[112px] cursor-pointer items-center justify-center rounded-[4px] px-[18px] py-[26px] transition-colors duration-200',
        ZONE_STYLES[status]
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          onFileSelect(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      {isEmpty ? (
        <div className="flex flex-col items-center gap-[10px] text-center">
          <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[3px] border border-[rgba(236,234,244,.16)] font-mono text-[15px] text-label">
            {'↑'}
          </span>
          <p className="text-[13.5px] text-text2">CSV 파일을 끌어다 놓거나 클릭해서 선택</p>
          <p className="font-mono text-[9px] uppercase tracking-[.14em] text-faint2">
            max 10 mb · .csv
          </p>
        </div>
      ) : (
        <div className="flex w-full items-center gap-[12px]">
          <span
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[3px] font-mono text-[9.5px]"
            style={{
              color: mark.color,
              backgroundColor: `${mark.color}14`,
              border: `1px solid ${mark.color}66`,
            }}
          >
            {mark.symbol}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-ink">{file.name}</p>
            <p className="font-mono text-[9.5px] uppercase tracking-[.1em] text-faint2">
              {formatKB(file.size)} · 선택됨
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFile();
            }}
            aria-label="선택한 파일 제거"
            className="shrink-0 text-faint2 transition-colors duration-200 hover:text-danger"
          >
            {'✕'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DropZone;
