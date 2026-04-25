export default function Logo({ size = 'md', dark = false }) {
  const textColor = dark ? 'text-white' : 'text-st-green'
  const sizes = {
    sm: { emblem: 28, title: 'text-base', sub: 'text-[10px]' },
    md: { emblem: 36, title: 'text-xl', sub: 'text-xs' },
    lg: { emblem: 48, title: 'text-3xl', sub: 'text-sm' },
  }
  const s = sizes[size]

  return (
    <div className="flex items-center gap-2.5">
      {/* ST Emblem — S-curve mark */}
      <svg
        width={s.emblem}
        height={s.emblem * 0.6}
        viewBox="0 0 100 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5 10 C20 0, 50 0, 65 20 C75 32, 60 38, 50 30 C38 22, 42 18, 55 18 C70 18, 90 28, 95 50"
          stroke={dark ? 'white' : '#064029'}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M5 10 C15 35, 35 42, 50 30"
          stroke={dark ? 'white' : '#064029'}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M50 30 C65 18, 85 25, 95 50"
          stroke={dark ? 'rgba(255,255,255,0.4)' : 'rgba(6,64,41,0.3)'}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {/* Text lockup */}
      <div className="flex flex-col leading-none">
        <span className={`font-bold tracking-tight ${s.title} ${textColor}`}>
          Mini Mulligans
        </span>
        <span className={`font-medium tracking-widest uppercase ${s.sub} ${dark ? 'text-white/60' : 'text-st-graphite'}`}>
          by Swing Theory
        </span>
      </div>
    </div>
  )
}
