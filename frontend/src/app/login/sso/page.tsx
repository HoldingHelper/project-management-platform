"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { TokenResponse } from "@/lib/types";
import { getWorkspaceDestination } from "@/lib/auth/workspace-navigation";

async function signIn(): Promise<TokenResponse> {
  const response = await fetch('/api/v1/auth/oidc/configuration', {cache:'no-store'});
  if(!response.ok) throw new Error('Single sign-on is unavailable.');
  const config = await response.json();
  const issuer = new URL(config.issuer), parts = issuer.pathname.split('/realms/');
  if(issuer.protocol !== 'https:' || parts.length !== 2 || !parts[1]) throw new Error('Invalid identity configuration.');
  const {default:Keycloak} = await import('keycloak-js');
  const client = new Keycloak({url:issuer.origin+parts[0],realm:parts[1],clientId:config.client_id});
  const authenticated = await client.init({onLoad:'login-required',pkceMethod:'S256',checkLoginIframe:false,redirectUri:window.location.origin+'/login/sso'});
  if(!authenticated || !client.token) throw new Error('Sign-in was not completed.');
  try {
    const exchange = await fetch('/api/v1/auth/oidc/exchange',{method:'POST',headers:{Authorization:'Bearer '+client.token},cache:'no-store'});
    if(!exchange.ok) throw new Error('Your identity is not assigned to an active workspace account.');
    return await exchange.json();
  } finally {
    client.token=undefined;client.refreshToken=undefined;client.idToken=undefined;
  }
}

export default function SingleSignOn() {
  const {adoptSession} = useAuth(), router=useRouter();
  const pending=useRef<ReturnType<typeof signIn>|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;pending.current ??= signIn();
    void pending.current.then(session=>{
      if(active){adoptSession(session);router.replace(getWorkspaceDestination(session.user.id));}
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Sign-in failed.');});
    return ()=>{active=false;};
  },[adoptSession,router]);
  return <main className="pmp-access-form"><h1>Sign in with Avenour</h1>{error?<><p role="alert">{error}</p><a href="/login">Return to sign in</a></>:<p>Connecting to secure sign-in…</p>}</main>;
}
