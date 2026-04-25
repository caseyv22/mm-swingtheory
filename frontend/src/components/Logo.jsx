export default function Logo({ size = 'md', dark = false }) {
  const sizes = {
    sm: { emblem: 28, title: 'text-base', sub: 'text-[10px]' },
    md: { emblem: 36, title: 'text-xl', sub: 'text-xs' },
    lg: { emblem: 48, title: 'text-3xl', sub: 'text-sm' },
  }
  const s = sizes[size]

  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/STEmblem.svg"
        alt="Swing Theory"
        width={s.emblem}
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
