import { SignUp } from '@clerk/clerk-react'

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-st-green flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img
  src="/STEmblem.svg"
  alt="Swing Theory"
  width={72}
  height={40}
  className="brightness-0 invert mx-auto"
/>
          <div className="text-center">
            <p className="font-display text-4xl text-white tracking-widest">MINI MULLIGANS</p>
            <p className="font-body text-white/60 text-xs font-semibold tracking-widest uppercase mt-1">by Swing Theory</p>
          </div>
        </div>
        <SignUp
          routing="path"
          path="/signup"
          signInUrl="/login"
          forceRedirectUrl="/onboarding"
        />
      </div>
    </div>
  )
}
