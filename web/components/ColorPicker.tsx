'use client';

const SWATCHES = [
  { hex: '#6b7280', label: 'Gray' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#14b8a6', label: 'Teal' },
  { hex: '#84cc16', label: 'Lime' },
  { hex: '#78716c', label: 'Stone' },
];

type Props = {
  selected: string | null;
  onSelect: (color: string) => void;
};

export function ColorPicker({ selected, onSelect }: Props) {
  return (
    <div className="mt-2">
      <p className="text-xs text-gray-400 mb-2">Color</p>
      <div className="flex flex-wrap gap-2">
        {SWATCHES.map(s => (
          <button
            key={s.hex}
            onClick={() => onSelect(s.hex)}
            aria-label={s.label}
            title={s.label}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{
              backgroundColor: s.hex,
              border: selected === s.hex ? '2px solid #111827' : '2px solid transparent',
            }}
          >
            {selected === s.hex && <span className="text-white text-xs font-bold">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export { SWATCHES };
