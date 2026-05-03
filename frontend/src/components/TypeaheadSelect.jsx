import { useState, useRef, useEffect } from 'react'

/**
 * TypeaheadSelect — reusable searchable dropdown
 *
 * Props:
 *   options: [{ value, label, sublabel? }]
 *   value: current selected value
 *   onChange: (value) => void
 *   placeholder: string
 *   disabled?: boolean
 */
export default function TypeaheadSelect({ options = [], value, onChange, placeholder = 'Search…', disabled = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find(o => o.value === value)

  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(option) {
    onChange(option.value)
    setQuery('')
    setOpen(false)
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
  }

  function handleInputClick() {
    if (!disabled) {
      setOpen(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger / Input */}
      <div
        onClick={handleInputClick}
        className={`flex items-center w-full border rounded-lg px-3 py-2.5 text-base bg-white transition-all cursor-text
          ${open ? 'border-[#1D9E75] ring-2 ring-[#1D9E75]/20' : 'border-gray-200'}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-gray-300'}
        `}
      >
        {open ? (
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 outline-none bg-transparent text-gray-900 placeholder-gray-500 font-sans text-base"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}>
            {selected ? (
              <span>
                {selected.label}
                {selected.sublabel && <span className="text-gray-500 text-xs ml-1.5">{selected.sublabel}</span>}
              </span>
            ) : placeholder}
          </span>
        )}

        <div className="flex items-center gap-1 ml-2 shrink-0">
          {selected && !open && (
            <button
              onClick={handleClear}
              className="w-4 h-4 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-600 hover:bg-gray-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 italic">
              {query ? `No results for "${query}"` : 'No options available'}
            </div>
          ) : (
            <ul className="max-h-52 overflow-y-auto py-1">
              {filtered.map(option => (
                <li key={option.value}>
                  <button
                    onMouseDown={e => e.preventDefault()} // prevent blur before click
                    onClick={() => handleSelect(option)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                      ${option.value === value
                        ? 'bg-[#E1F5EE] text-[#064029] font-semibold'
                        : 'text-gray-800 hover:bg-gray-50'
                      }`}
                  >
                    <span className="block font-medium">{option.label}</span>
                    {option.sublabel && (
                      <span className="block text-xs text-gray-500 mt-0.5">{option.sublabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
