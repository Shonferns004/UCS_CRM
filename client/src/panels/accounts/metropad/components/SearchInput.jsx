import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

function SearchInput({ value: externalValue, onChange, placeholder = 'Search...', disabled = false }) {
  const [internalValue, setInternalValue] = useState(externalValue || '');
  const timeoutRef = useRef(null);

  useEffect(() => {
    setInternalValue(externalValue || '');
  }, [externalValue]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setInternalValue(newValue);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (onChange) {
        onChange(newValue);
      }
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="search-input-wrapper">
      <span className="search-input-icon">
        <Search size={16} strokeWidth={2} />
      </span>
      <input
        type="text"
        className="search-input"
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

export default SearchInput;
