"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LocalizedText } from "@/lib/i18n/I18nProvider";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { AccessShell } from "@/components/ui/AccessShell";
import { Button, Field, TextInput } from "@/components/ds";
import { resetPassword } from "@/lib/api/auth";
function ResetForm(){
  const { t: translateUI } = useI18n();
const params=useSearchParams();const token=params.get("token")??"";const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [status,setStatus]=useState<"idle"|"loading"|"done"|"error">("idle");const mismatch=!!confirm&&password!==confirm;async function submit(event:React.FormEvent){event.preventDefault();if(mismatch||password.length<8||!token)return;setStatus("loading");try{await resetPassword(token,password);setStatus("done")}catch{setStatus("error")}}if(!token)return <div className="pmp-access-error" role="alert"><LocalizedText message={"This reset link is incomplete or expired."} />{" "}<Link href="/forgot-password"><LocalizedText message={"Request a new link."} /></Link></div>;if(status==="done")return <div className="pmp-access-success" role="status"><h2><LocalizedText message={"Password updated"} /></h2><p><LocalizedText message={"You can now sign in with your new password."} /></p><Link href="/login"><LocalizedText message={"Continue to login"} /></Link></div>;return <form className="pmp-access-form" onSubmit={submit}><Field label={translateUI("New password")}><TextInput type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/></Field><Field label={translateUI("Confirm password")}><TextInput type="password" autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)}/></Field>{mismatch&&<div className="pmp-access-error" role="alert"><LocalizedText message={"Passwords do not match."} /></div>}{status==="error"&&<div className="pmp-access-error" role="alert"><LocalizedText message={"The password could not be reset. Request a new link and try again."} /></div>}<Button type="submit" disabled={status==="loading"||password.length<8||mismatch}><KeyRound size={16}/>{status==="loading"?<LocalizedText message={"Updating…"} />:<LocalizedText message={"Update password"} />}</Button></form>}
export default function ResetPasswordPage(){
  const { t: translateUI } = useI18n();
return <AccessShell eyebrow={translateUI("Account recovery")} title={translateUI("Choose a new password")} description={translateUI("Use at least eight characters and avoid reusing an old password.")}><Suspense fallback={<div><LocalizedText message={"Loading reset form…"} /></div>}><ResetForm/></Suspense></AccessShell>}
