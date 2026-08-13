export function TimePicker({ value, onChange, placeholder }) {
  return (
    <input
      type="time"
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 5,
        padding: '5px 7px',
        fontSize: 11,
        fontFamily: 'inherit',
        color: 'var(--ink)',
        boxSizing: 'border-box',
      }}
    />
  );
}
