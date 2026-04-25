export default function Logo({ size = 'md', dark = false, centered = false }) {
  const sizes = {
    sm: { emblem: 28, title: 'text-base', sub: 'text-[10px]' },
    md: { emblem: 36, title: 'text-xl', sub: 'text-xs' },
    lg: { emblem: 48, title: 'text-3xl', sub: 'text-sm' },
  }
  const s = sizes[size]

  if (centered) {
    return (
      <div className="flex flex-col items-center gap-2">
        <img
          src="/STEmblem.svg"
          alt="Swing Theory"
          width={s.emblem * 1.8}
          height={s.emblem}
          className={dark ? 'brightness-0 invert' : ''}
        />
        <div className="text-center">
          <p className={`font-display tracking-widest ${s.title} ${dark ? 'text-white' : 'text-st-green'}`}>
            MINI MULLIGANS
          </p>
          <p className={`font-body font-semibold tracking-widest uppercase ${s.sub} ${dark ? 'text-white/60' : 'text-st-graphite'}`}>
            by Swing Theory
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/STEmblem.svg"
        alt="Swing Theory"
        width={s.emblem * 1.8}
        height={s.emblem}
        className={dark ? 'brightness-0 invert' : ''}
      />
      <div className="flex flex-col leading-none">
        <span className={`font-display tracking-widest ${s.title} ${dark ? 'text-white' : 'text-st-green'}`}>
          MINI MULLIGANS
        </span>
        <span className={`font-body font-semibold tracking-widest uppercase ${s.sub} ${dark ? 'text-white/60' : 'text-st-graphite'}`}>
          by Swing Theory
        </span>
      </div>
    </div>
  )
}
