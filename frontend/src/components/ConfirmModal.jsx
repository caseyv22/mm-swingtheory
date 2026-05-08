// ─── ConfirmModal — reusable branded confirmation dialog ──────────────────────
//
// Replaces browser confirm() across the app. Designed to match the existing
// modal pattern (ConfirmDeleteModal, ConfirmDeactivateEnrollmentModal) and
// extend it with:
//   - A `children` slot so callers pass any JSX as the message body
//     (handles multi-paragraph copy that wouldn't render via a flat string)
//   - An optional checkbox guardrail for high-stakes actions
//     (replaces double-confirm patterns like delete-league)
//   - A `zIndex` prop so this modal can stack on top of an existing parent
//     modal (used inside ShiftModal and EditSeasonModal)
//   - Three button styles: red (destructive), amber (caution), green (positive)
//
// Usage:
//
//   <ConfirmModal
//     title="REMOVE SHIFT"
//     confirmLabel="Remove Shift"
//     onConfirm={handleDelete}
//     onClose={() => setShowConfirm(false)}
//     loading={deleting}
//   >
//     <p className="text-sm text-gray-600">
//       This shift will be permanently removed.
//     </p>
//   </ConfirmModal>
//
// With checkbox guardrail:
//
//   <ConfirmModal
//     title="DELETE LEAGUE"
//     confirmLabel="Delete League"
//     requireCheckbox="I understand this cannot be undone"
//     onConfirm={handleDelete}
//     onClose={() => setShowConfirm(false)}
//   >
//     <p>...</p>
//   </ConfirmModal>
//
// Stacked on top of another modal:
//
//   <ConfirmModal zIndex={60} ... />

import { useState } from 'react'

const STYLE_CLASSES = {
  red: {
    btn: 'bg-red-600 hover:bg-red-700',
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
  },
  amber: {
    btn: 'bg-amber-600 hover:bg-amber-700',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
  },
  green: {
    btn: 'bg-[#064029] hover:bg-[#085041]',
    iconBg: 'bg-[#E1F5EE]',
    iconText: 'text-[#064029]',
  },
}

function WarningIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  )
}

function InfoIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function DestructiveIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function iconForType(type) {
  switch (type) {
    case 'info':         return InfoIcon
    case 'destructive':  return DestructiveIcon
    case 'warning':
    default:             return WarningIcon
  }
}

export default function ConfirmModal({
  title,
  subtitle,
  confirmLabel = 'Confirm',
  confirmStyle = 'red',
  iconType = 'warning',
  requireCheckbox,
  loading = false,
  zIndex = 50,
  onConfirm,
  onClose,
  children,
}) {
  const [acknowledged, setAcknowledged] = useState(false)

  const style = STYLE_CLASSES[confirmStyle] || STYLE_CLASSES.red
  const Icon = iconForType(iconType)
  const canConfirm = !loading && (!requireCheckbox || acknowledged)

  // Tailwind doesn't ship arbitrary z-index by default at runtime, so we use
  // inline style for zIndex when it's not 50. This avoids JIT-compilation
  // issues with dynamic z-[xx] class names.
  const zStyle = zIndex !== 50 ? { zIndex } : undefined
  const zClass = zIndex === 50 ? 'z-50' : ''

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/50 p-4`}
      style={zStyle}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 ${style.iconBg} rounded-full flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${style.iconText}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-lg text-gray-900 tracking-wide">{title}</h3>
              {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
            </div>
          </div>

          <div className="text-sm text-gray-600 leading-relaxed space-y-2">
            {children}
          </div>

          {requireCheckbox && (
            <label className="mt-4 flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-[#1D9E75] focus:ring-[#1D9E75] border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700 font-medium leading-snug">
                {requireCheckbox}
              </span>
            </label>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${style.btn}`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
