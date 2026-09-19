interface StarRatingProps {
  value: number;
  onChange: (n: number) => void;
  size?: 'normal' | 'big';
}

export function StarRating({ value, onChange, size }: StarRatingProps) {
  return (
    <div className={`stars${size === 'big' ? ' cook-stars' : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className={i <= value ? 'filled' : ''}
          onClick={() => onChange(value === i ? 0 : i)}
        >
          {'\u2605'}
        </button>
      ))}
    </div>
  );
}
