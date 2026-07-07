// ─── Resend Email Sender ──────────────────────────────────────────────────────
// All emails from info@swingtheory.golf
// Template matches existing Swing Theory email style

const FROM = 'Swing Theory <info@swingtheory.golf>'
const LOGO_URL = 'https://swingtheory.golf/wp-content/uploads/2025/03/Wide-Asset-3-copy.png'
const APP_URL = 'https://sync.swingtheory.golf'

// ─── Send via Resend ──────────────────────────────────────────────────────────
export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email to', to)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.json()
    console.error('Resend error:', err)
  }
  return res
}

// ─── Base Layout ──────────────────────────────────────────────────────────────
function baseLayout({ preheader = '', headerRight = '', body, footerExtra = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background:#f0f4f1;font-family:Arial,sans-serif">

${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#f0f4f1">${preheader}</div>` : ''}

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f1;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">

  <!-- Header -->
  <tr>
    <td style="background:#064029;padding:24px 32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle">
            <img src="${LOGO_URL}" alt="Swing Theory" height="36" style="display:block;height:36px;">
          </td>
          ${headerRight ? `<td style="text-align:right;vertical-align:middle">${headerRight}</td>` : ''}
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  ${body}

  <!-- Footer -->
  <tr>
    <td style="background:#f7faf8;border-top:1px solid #eaf3ec;padding:20px 32px;text-align:center">
      ${footerExtra}
      <p style="font-size:11px;color:#999999;margin:0">Swing Theory — 50 S De Lacey Ave, Pasadena, CA 91105</p>
      <p style="font-size:11px;color:#999999;margin:6px 0 0">626-879-5513 &nbsp;•&nbsp; info@swingtheory.golf &nbsp;•&nbsp; swingtheory.golf</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ─── CTA Button ───────────────────────────────────────────────────────────────
function ctaButton(text, url) {
  return `
  <tr>
    <td style="padding:0 32px 32px;text-align:center">
      <a href="${url}" style="display:inline-block;background:#064029;color:#ffffff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.5px">${text}</a>
    </td>
  </tr>`
}

// ─── Info Row (label + value) ─────────────────────────────────────────────────
function infoRow(label, value) {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #eaf3ec">
      <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#888888">${label}</span>
      <span style="font-size:14px;color:#1a1a1a;font-weight:600;margin-left:12px">${value}</span>
    </td>
  </tr>`
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${m} ${ampm}`
}

// ─── 1. Booking Confirmed (to parent/student) ──────────────────────────────────
export function bookingConfirmedEmail({ recipientName, programName, date, startTime, endTime, bay, instructorName, bookerType, childName }) {
  const displayName = bookerType === 'parent' && childName ? childName : recipientName
  const subject = `You're booked — ${programName} · ${formatDate(date)}`

  const html = baseLayout({
    preheader: `Your session is confirmed for ${formatDate(date)} at ${formatTime(startTime)}.`,
    headerRight: `
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7)">Booking Confirmed</div>
      <div style="font-size:13px;color:#ffffff;margin-top:4px">${formatDate(date)}</div>`,
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#064029;margin-bottom:8px">You're all set, ${recipientName}!</div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        ${bookerType === 'parent' ? `${childName}'s spot` : 'Your spot'} is confirmed for <strong>${programName}</strong>.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 24px">
      <div style="background:#f7faf8;border:1px solid #d8e8dc;border-radius:12px;padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${infoRow('Program', programName)}
          ${infoRow('Date', formatDate(date))}
          ${infoRow('Time', `${formatTime(startTime)} – ${formatTime(endTime)}`)}
          ${bay ? infoRow('Bay', bay) : ''}
          ${instructorName ? infoRow('Instructor', instructorName) : ''}
          ${childName ? infoRow('Golfer', childName) : ''}
        </table>
      </div>
    </td>
  </tr>
  ${ctaButton('View My Bookings', `${APP_URL}/my-bookings`)}`,
  })

  return { subject, html }
}

// ─── 2. Booking Confirmed (admin notification) ────────────────────────────────
export function bookingConfirmedAdminEmail({ recipientName, recipientEmail, programName, date, startTime, childName }) {
  const subject = `New Booking: ${recipientName} — ${programName} · ${formatDate(date)}`

  const html = baseLayout({
    preheader: `${recipientName} just booked ${programName} on ${formatDate(date)}.`,
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#064029;margin-bottom:8px">New Booking</div>
      <div style="font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:4px">${recipientName}</div>
      <div style="font-size:14px;color:#888888">${recipientEmail}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 24px">
      <div style="background:#f7faf8;border:1px solid #d8e8dc;border-radius:12px;padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${infoRow('Program', programName)}
          ${infoRow('Date', formatDate(date))}
          ${infoRow('Time', formatTime(startTime))}
          ${childName ? infoRow('Child', childName) : ''}
        </table>
      </div>
    </td>
  </tr>
  ${ctaButton('View in Admin', `${APP_URL}/admin`)}`,
  })

  return { subject, html }
}

// ─── 3. Booking Cancelled by User ─────────────────────────────────────────────
export function bookingCancelledEmail({ recipientName, programName, date, startTime, bookerType, childName }) {
  const subject = `Booking cancelled — ${programName} · ${formatDate(date)}`

  const html = baseLayout({
    preheader: `Your booking for ${formatDate(date)} has been cancelled.`,
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:8px">Booking Cancelled</div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        ${bookerType === 'parent' ? `${childName}'s booking` : 'Your booking'} for <strong>${programName}</strong> on <strong>${formatDate(date)}</strong> at <strong>${formatTime(startTime)}</strong> has been cancelled.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 32px">
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        Want to book another session? There are still spots available.
      </p>
    </td>
  </tr>
  ${ctaButton('Book Another Session', `${APP_URL}/home`)}`,
  })

  return { subject, html }
}

// ─── 4. Booking Cancelled Admin Notification ──────────────────────────────────
export function bookingCancelledAdminEmail({ recipientName, programName, date, startTime }) {
  const subject = `Cancellation: ${recipientName} — ${programName} · ${formatDate(date)}`

  const html = baseLayout({
    preheader: `${recipientName} cancelled their booking for ${formatDate(date)}.`,
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#888888;margin-bottom:8px">Booking Cancelled</div>
      <div style="font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:4px">${recipientName}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 24px">
      <div style="background:#f7faf8;border:1px solid #d8e8dc;border-radius:12px;padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${infoRow('Program', programName)}
          ${infoRow('Date', formatDate(date))}
          ${infoRow('Time', formatTime(startTime))}
          ${infoRow('Status', 'Cancelled by member')}
        </table>
      </div>
    </td>
  </tr>
  ${ctaButton('View in Admin', `${APP_URL}/admin`)}`,
  })

  return { subject, html }
}

// ─── 5. Session Cancelled by Admin ────────────────────────────────────────────
export function sessionCancelledEmail({ recipientName, programName, date, startTime, cancelReason }) {
  const subject = `Session Cancelled — ${programName} · ${formatDate(date)}`

  const html = baseLayout({
    preheader: `Your ${programName} session on ${formatDate(date)} has been cancelled.`,
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:8px">Session Cancelled</div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        Hi ${recipientName}, we're sorry to let you know that the following session has been cancelled.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px">
      <div style="background:#f7faf8;border:1px solid #d8e8dc;border-radius:12px;padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${infoRow('Program', programName)}
          ${infoRow('Date', formatDate(date))}
          ${infoRow('Time', formatTime(startTime))}
          ${cancelReason ? infoRow('Reason', cancelReason) : ''}
        </table>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 24px">
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        We apologize for the inconvenience. Please book another available session — we look forward to seeing you soon.
      </p>
    </td>
  </tr>
  ${ctaButton('Book Another Session', `${APP_URL}/home`)}`,
  })

  return { subject, html }
}

// ─── 6. 24hr Reminder ─────────────────────────────────────────────────────────
export function reminderEmail({ recipientName, programName, date, startTime, endTime, bay, instructorName, bookerType, childName }) {
  const subject = `See you tomorrow — ${programName} · ${formatTime(startTime)}`
  const displayName = bookerType === 'parent' && childName ? childName : recipientName

  const html = baseLayout({
    preheader: `Reminder: ${displayName} has a session tomorrow at ${formatTime(startTime)}.`,
    headerRight: `
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7)">Session Reminder</div>
      <div style="font-size:13px;color:#ffffff;margin-top:4px">Tomorrow · ${formatTime(startTime)}</div>`,
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#064029;margin-bottom:8px">See you tomorrow, ${recipientName}!</div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        Just a reminder that ${bookerType === 'parent' ? `${childName} has` : 'you have'} a <strong>${programName}</strong> session tomorrow.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 24px">
      <div style="background:#f7faf8;border:1px solid #d8e8dc;border-radius:12px;padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${infoRow('Date', formatDate(date))}
          ${infoRow('Time', `${formatTime(startTime)} – ${formatTime(endTime)}`)}
          ${bay ? infoRow('Bay', bay) : ''}
          ${instructorName ? infoRow('Instructor', instructorName) : ''}
          ${childName ? infoRow('Golfer', childName) : ''}
        </table>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 32px 8px">
      <div style="background:#e8f4eb;border-radius:12px;padding:16px 24px;text-align:center">
        <p style="font-size:14px;color:#064029;font-weight:600;margin:0">50 S De Lacey Ave, Old Town Pasadena</p>
      </div>
    </td>
  </tr>
  ${ctaButton('View My Bookings', `${APP_URL}/my-bookings`)}`,
  })

  return { subject, html }
}

// ─── 7. Welcome (account created) ────────────────────────────────────────────
export function welcomeEmail({ recipientName, role, email, tempPassword }) {
  const subject = 'Welcome to Swing Theory — Your Login Details'
  const roleDisplay = role ? role.charAt(0).toUpperCase() + role.slice(1) : ''

  const html = baseLayout({
    preheader: 'Your Swing Theory account is ready. Use the password below to log in.',
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#064029;margin-bottom:8px">Welcome, ${recipientName}!</div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        Your Swing Theory account is ready. Use the credentials below to log in. You'll be asked to set your own password right after.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 8px">
      <div style="background:#f7faf8;border:1px solid #d8e8dc;border-radius:12px;padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${infoRow('Email', email || '')}
          ${infoRow('Temporary Password', tempPassword || '')}
          ${infoRow('Role', roleDisplay)}
        </table>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 16px">
      <p style="font-size:13px;color:#888888;line-height:1.6;margin:0">
        For your security, you'll be prompted to change this temporary password when you first log in. If you didn't expect this email, please contact us.
      </p>
    </td>
  </tr>
  ${ctaButton('Log In to Swing Theory', APP_URL + '/login')}`,
  })

  return { subject, html }
}

// ─── 7b. Invite (invitation-based account creation) ──────────────────────────
// Used by POST /admin/members and POST /admin/members/:id/resend-invite when
// creating a member via the Clerk Invitations flow (Phase 2, July 2026). The
// admin never sets a password — the invitee clicks the CTA, lands on
// /accept-invitation, and picks their own password.
//
// inviteUrl is the raw Clerk-generated ticket URL (from POST /v1/invitations).
// The `redirect_url` embedded in it points at /accept-invitation on
// sync.swingtheory.golf; Clerk appends `__clerk_ticket=…` when the invitee
// clicks the button.
export function inviteEmail({ recipientName, role, email, inviteUrl }) {
  const subject = "You're invited to Swing Theory"
  const roleDisplay = role ? role.charAt(0).toUpperCase() + role.slice(1) : ''

  const html = baseLayout({
    preheader: 'Set up your Swing Theory account — click the button below to pick a password.',
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#064029;margin-bottom:8px">Welcome, ${recipientName}!</div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        You've been invited to Swing Theory. Click the button below to finish setting up your account — you'll pick your own password, then land right in the app.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 8px">
      <div style="background:#f7faf8;border:1px solid #d8e8dc;border-radius:12px;padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${infoRow('Email', email || '')}
          ${roleDisplay ? infoRow('Role', roleDisplay) : ''}
        </table>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 16px">
      <p style="font-size:13px;color:#888888;line-height:1.6;margin:0">
        This invite link is single-use and will expire in 30 days. If it stops working, ask your admin to resend it. If you didn't expect this email, feel free to ignore it.
      </p>
    </td>
  </tr>
  ${ctaButton('Set Up Your Account', inviteUrl)}`,
  })

  return { subject, html }
}

// ─── 8. Password reset (user-triggered "forgot password") ────────────────────
export function passwordResetEmail({ recipientName, resetUrl }) {
  const subject = 'Reset Your Swing Theory Password'

  const html = baseLayout({
    preheader: 'Click the link below to reset your Swing Theory password.',
    body: `
  <tr>
    <td style="padding:32px 32px 8px">
      <div style="font-size:22px;font-weight:700;color:#064029;margin-bottom:8px">Hi ${recipientName},</div>
      <p style="font-size:14px;color:#555555;line-height:1.6;margin:0">
        We received a request to reset your password. Click the button below to choose a new one. This link expires shortly, so use it soon.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 16px">
      <p style="font-size:13px;color:#888888;line-height:1.6;margin:0">
        If you didn't request a password reset, you can safely ignore this email — your password won't change.
      </p>
    </td>
  </tr>
  ${ctaButton('Reset My Password', resetUrl)}`,
  })

  return { subject, html }
}
