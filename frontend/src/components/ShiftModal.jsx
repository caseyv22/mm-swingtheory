import { useState, useEffect, useMemo } from 'react'
import ConfirmModal from './ConfirmModal'

/**
 * ShiftModal — admin-only modal for creating, editing, and deleting shifts.
 *
 * Props:
 *   - open (bool): whether modal is visible
 *   - shift (object|null): the shift to edit, or null for "add new"
 *   - swingers (array): list of all swingers, used to populate the employee select
 *   - prefill (object|null): when adding, optional { user_id, date } to seed the form
 *                            (set when admin clicks "+ add" inside an empty grid cell)
 *   - onClose (function): called when user cancels or after successful save/delete
 *   - onSave (function): async (payload) => result; called with the form payload
 *   - onDelete (function): async () => result; called when user confirms delete
 *
 * Auto-detects a preset match when start/end times line up with a known preset;
 * otherwise stores shift_type='Custom'.
 */

const PRESETS = {
  Morning:   { start: '10:00', end: '15:00' },
  Mid:       { start: '13:00', end: '17:00' },
  Day:       { start: '10:00', end: '17:00' },
  Evening:   { start: '15:00', end: '20:00' },
  Night:     { start: '17:00', end: '20:00' },
  'All Day': { start: '10:00', end: '20:00' },
}

function detectPreset(start, end) {
  for (const [name, t] of Object.entries(PRESETS)) {
    if (t.start === start && t.end === end) return name
  }
  return 'Custom'
}

function timeStrToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function calcHours(start, end) {
  return Math.max(0, (timeStrToMin(end) - timeStrToMin(start)) / 60)
}

function fmtTime12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ampm
}

export default function ShiftModal({ open, shift, swingers, prefill, onClose, onSave, onDelete }) {
  const [userId, setUserId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const isEditing = !!shift

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return
    if (shift) {
      setUserId(shift.user_id || '')
      setDate(shift.date || '')
      setStartTime(shift.start_time || '')
      setEndTime(shift.end_time || '')
    } else {
      setUserId(prefill?.user_id || (swingers[0]?.id || ''))
      setDate(prefill?.date || new Date().toISOString().split('T')[0])
      setStartTime('')
      setEndTime('')
    }
    setError(null)
    setSaving(false)
    setDeleting(false)
  }, [open, shift, prefill, swingers])

  const detectedType = useMemo(() => detectPreset(startTime, endTime), [startTime, endTime])
  const hours = useMemo(() => calcHours(startTime, endTime), [startTime, endTime])

  function applyPreset(name) {
    const p = PRESETS[name]
    if (!p) return
    setStartTime(p.start)
    setEndTime(p.end)
  }

  async function handleSave() {
    setError(null)
    if (!userId) { setError('Select an employee.'); return }
    if (!date) { setError('Choose a date.'); return }
    if (!startTime || !endTime) { setError('Set start and end times.'); return }
    if (hours <= 0) { setError('End time must be after start time.'); return }

    setSaving(true)
    const payload = {
      user_id: userId,
      date,
      start_time: startTime,
      end_time: endTime,
      shift_type: detectedType,
    }
    try {
      const result = await onSave(payload)
      if (result && result.error) {
        setError(result.error)
        setSaving(false)
        return
      }
      // success — parent closes the modal
    } catch (e) {
      setError(e?.message || 'Save failed.')
      setSaving(false)
    }
  }

  function requestDelete() {
    if (!isEditing) return
    setShowConfirmDelete(true)
  }

  async function confirmDelete() {
    setShowConfirmDelete(false)
    setDeleting(true)
    try {
      const result = await onDelete()
      if (result && result.error) {
        setError(result.error)
        setDeleting(false)
        return
      }
    } catch (e) {
      setError(e?.message || 'Delete failed.')
      setDeleting(false)
    }
  }

  if (!open) return null

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-2xl text-[#064029] tracking-wide">
              {isEditing ? 'EDIT SHIFT' : 'ADD SHIFT'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Employee</label>
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              >
                {swingers.length === 0 && <option value="">No swingers available</option>}
                {swingers.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Quick Presets</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(PRESETS).map(name => {
                  const isActive = detectedType === name
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyPreset(name)}
                      className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        isActive
                          ? 'bg-[#064029] text-white border-[#064029]'
                          : 'bg-[#E1F5EE] text-[#064029] border-transparent hover:bg-[#064029] hover:text-white'
                      }`}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              {startTime && endTime && hours > 0 ? (
                <p className="text-sm text-gray-700">
                  <span className="font-bold text-[#064029]">{fmtTime12(startTime)} – {fmtTime12(endTime)}</span>
                  <span className="text-gray-500"> · {hours.toFixed(1)} hrs · {detectedType}</span>
                </p>
              ) : (
                <p className="text-sm text-gray-500">Choose a start and end time.</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={handleSave}
              disabled={saving || deleting || swingers.length === 0}
              className="flex-1 bg-[#064029] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm tracking-wide"
            >
              {saving ? 'Saving…' : (isEditing ? 'Update Shift' : 'Save Shift')}
            </button>
            <button
              onClick={onClose}
              disabled={saving || deleting}
              className="border border-gray-200 text-gray-600 text-sm font-semibold py-3 px-4 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {isEditing && (
              <button
                onClick={requestDelete}
                disabled={saving || deleting}
                className="border border-red-200 text-red-500 text-sm font-semibold py-3 px-4 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? '…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    {showConfirmDelete && (
      <ConfirmModal
        title="DELETE SHIFT"
        confirmLabel="Delete Shift"
        confirmStyle="red"
        iconType="destructive"
        zIndex={60}
        onConfirm={confirmDelete}
        onClose={() => setShowConfirmDelete(false)}
      >
        <p>This shift will be permanently removed from the schedule.</p>
      </ConfirmModal>
    )}
    </>
  )
}
