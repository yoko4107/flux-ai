"use client"

import { useEffect, useState, useRef } from "react"
import { Sparkles, CheckCircle, Upload, Eye, EyeOff, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

type Step = "loading" | "error" | "welcome" | "otp-sent" | "otp-verify" | "password" | "national-id" | "selfie" | "done"

interface InviteInfo {
  email: string
  phone: string | null
  role: string
  orgName: string | null
}

interface Message {
  role: "bot" | "user"
  text: string
  timestamp: Date
}

function BotMsg({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-800 max-w-[80%]">
        {text}
      </div>
    </div>
  )
}

function UserMsg({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div className="bg-gray-800 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[80%]">
        {text}
      </div>
      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-white text-xs font-medium">U</div>
    </div>
  )
}

export default function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const [token, setToken] = useState("")
  const [step, setStep] = useState<Step>("loading")
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const [devOtp, setDevOtp] = useState<string | null>(null)

  // OTP
  const [otp, setOtp] = useState("")
  const [otpError, setOtpError] = useState("")
  const [verifiedOtp, setVerifiedOtp] = useState("")

  // Password
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [passError, setPassError] = useState("")

  // Files
  const [nationalIdUrl, setNationalIdUrl] = useState("")
  const [uploading, setUploading] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Suppress unused variable warning — devOtp is set for potential future use
  void devOtp

  function addMsg(role: "bot" | "user", text: string) {
    setMessages((prev) => [...prev, { role, text, timestamp: new Date() }])
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, step])

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t)
      fetch(`/api/register/${t}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setErrorMsg(data.error)
            setStep("error")
            return
          }
          setInvite(data)
          const orgPart = data.orgName ? ` at **${data.orgName}**` : ""
          setTimeout(() => {
            addMsg("bot", `Welcome! You've been invited to join${orgPart} as **${data.role}**.`)
            setTimeout(() => {
              addMsg("bot", `Your registered email is **${data.email}**. I'll send a one-time code to verify it.`)
              setStep("welcome")
            }, 800)
          }, 400)
        })
        .catch(() => {
          setErrorMsg("Failed to load invitation")
          setStep("error")
        })
    })
  }, [params])

  async function handleSendOtp() {
    if (!token) return
    addMsg("user", "Send me the OTP")
    const res = await fetch(`/api/register/${token}/send-otp`, { method: "POST" })
    const data = await res.json()
    if (data.devOtp) setDevOtp(data.devOtp)
    addMsg("bot", `I've sent a 6-digit code to **${invite?.email}**.${data.devOtp ? ` (Dev mode: your code is **${data.devOtp}**)` : ""} Enter it below to verify.`)
    setStep("otp-sent")
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) { setOtpError("Please enter all 6 digits"); return }
    setOtpError("")
    const res = await fetch(`/api/register/${token}/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp }),
    })
    if (res.ok) {
      setVerifiedOtp(otp)
      addMsg("user", "••••••")
      addMsg("bot", "Email verified! Now create a password for your account.")
      setStep("password")
    } else {
      const d = await res.json()
      setOtpError(d.error ?? "Invalid OTP")
    }
  }

  function handleSetPassword() {
    if (password.length < 8) { setPassError("Password must be at least 8 characters"); return }
    if (password !== confirmPassword) { setPassError("Passwords don't match"); return }
    setPassError("")
    addMsg("user", "Password set")
    addMsg("bot", "Great! Now please upload a photo of your **National ID** (front side). This helps us verify your identity.")
    setStep("national-id")
  }

  async function handleFileUpload(file: File, type: "national-id" | "selfie") {
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("type", type)
    const res = await fetch("/api/upload/kyc", { method: "POST", body: formData })
    const data = await res.json()
    setUploading(false)
    return data.url as string
  }

  async function handleNationalId(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await handleFileUpload(file, "national-id")
    setNationalIdUrl(url)
    addMsg("user", `${file.name} uploaded`)
    addMsg("bot", "Perfect! Now please upload a **selfie** — a clear photo of your face.")
    setStep("selfie")
  }

  async function handleSelfie(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await handleFileUpload(file, "selfie")
    addMsg("user", `${file.name} uploaded`)
    addMsg("bot", "Almost done! Let me finalize your account...")
    await handleComplete(url)
  }

  async function handleComplete(selfieUrlParam: string) {
    setSubmitting(true)
    const res = await fetch(`/api/register/${token}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        otp: verifiedOtp,
        password,
        nationalIdUrl,
        selfieUrl: selfieUrlParam,
      }),
    })
    setSubmitting(false)
    if (res.ok) {
      addMsg("bot", "Welcome aboard! Your account has been activated. Redirecting you to sign in...")
      setStep("done")
      setTimeout(() => router.push("/login"), 3000)
    } else {
      const d = await res.json()
      addMsg("bot", `Something went wrong: ${d.error ?? "Please try again."}`)
    }
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3 max-w-md px-4">
          <div className="text-4xl">🔗</div>
          <h2 className="text-xl font-bold text-gray-800">Invalid Link</h2>
          <p className="text-gray-500">{errorMsg}</p>
          <a href="/login" className="inline-block mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Go to Login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">FLUX.AI Registration</p>
          <p className="text-xs text-gray-500">{invite?.orgName ?? "Account Setup"}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl w-full mx-auto">
        {messages.map((m, i) =>
          m.role === "bot"
            ? <BotMsg key={i} text={m.text.replace(/\*\*(.*?)\*\*/g, "$1")} />
            : <UserMsg key={i} text={m.text} />
        )}

        {/* Step-specific input */}
        {step === "welcome" && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleSendOtp}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Send verification code
            </button>
          </div>
        )}

        {step === "otp-sent" && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 max-w-xs mx-auto">
            <p className="text-xs text-gray-500 text-center">Enter 6-digit code</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center text-2xl font-mono tracking-[0.5em] border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="000000"
            />
            {otpError && <p className="text-xs text-red-500 text-center">{otpError}</p>}
            <button
              onClick={handleVerifyOtp}
              disabled={otp.length !== 6}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Verify Code
            </button>
          </div>
        )}

        {step === "password" && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 max-w-xs mx-auto">
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="New password"
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-2.5 text-gray-400">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input
              type={showPass ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Confirm password"
            />
            {passError && <p className="text-xs text-red-500">{passError}</p>}
            <button
              onClick={handleSetPassword}
              disabled={!password || !confirmPassword}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Set Password
            </button>
          </div>
        )}

        {step === "national-id" && (
          <div className="flex justify-center pt-2">
            <label className={`flex flex-col items-center gap-2 px-6 py-4 bg-white border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-blue-500" /> : <Upload className="h-6 w-6 text-gray-400" />}
              <span className="text-sm text-gray-600 font-medium">{uploading ? "Uploading..." : "Upload National ID"}</span>
              <span className="text-xs text-gray-400">JPG, PNG, PDF up to 10MB</span>
              <input type="file" className="sr-only" accept="image/*,.pdf" onChange={handleNationalId} disabled={uploading} />
            </label>
          </div>
        )}

        {step === "selfie" && (
          <div className="flex justify-center pt-2">
            <label className={`flex flex-col items-center gap-2 px-6 py-4 bg-white border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 transition-colors ${uploading || submitting ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading || submitting ? <Loader2 className="h-6 w-6 animate-spin text-blue-500" /> : <Upload className="h-6 w-6 text-gray-400" />}
              <span className="text-sm text-gray-600 font-medium">{submitting ? "Finalizing account..." : uploading ? "Uploading..." : "Upload Selfie"}</span>
              <span className="text-xs text-gray-400">Clear photo of your face</span>
              <input type="file" className="sr-only" accept="image/*" capture="user" onChange={handleSelfie} disabled={uploading || submitting} />
            </label>
          </div>
        )}

        {step === "done" && (
          <div className="flex justify-center pt-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <p className="text-sm font-medium text-gray-700">Account activated!</p>
              <p className="text-xs text-gray-400">Redirecting to login...</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
