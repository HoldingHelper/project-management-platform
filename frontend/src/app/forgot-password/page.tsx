"use client";
import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { AccessShell } from "@/components/ui/AccessShell";
import { Button, Field, TextInput } from "@/components/ds";
import { forgotPassword } from "@/lib/api/auth";
export default function ForgotPasswordPage(){const [email,setEmail]=useState("");const [status,setStatus]=useState<"idle"|"loading"|"sent"|"error">("idle");async function submit(event:React.FormEvent){event.preventDefault();setStatus("loading");try{await forgotPassword(email);setStatus("sent")}catch{setStatus("error")}}return <AccessShell eyebrow="Account recovery" title="Reset your password" description="Enter your account email. If it exists, we’ll send a secure reset link.">{status==="sent"?<div className="pmp-access-success" role="status"><h2>Check your inbox</h2><p>If an account matches {email}, a reset link is on its way.</p><Link href="/login">Return to login</Link></div>:<form className="pmp-access-form" onSubmit={submit}><Field label="Email"><TextInput type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@company.com"/></Field>{status==="error"&&<div className="pmp-access-error" role="alert">The request could not be sent. Check your connection and retry.</div>}<Button type="submit" disabled={!email||status==="loading"}><Mail size={16}/>{status==="loading"?"Sending…":"Send reset link"}</Button><div className="pmp-access-helper"><Link href="/login">Return to login</Link></div></form>}</AccessShell>}
