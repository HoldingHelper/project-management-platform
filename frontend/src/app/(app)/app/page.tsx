"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/States";
export default function WorkspaceEntry(){const router=useRouter();useEffect(()=>{const saved=window.localStorage.getItem("workspace.last-module");router.replace(saved==="docs"?"/app/docs":"/h/holding")},[router]);return <div className="pmp-page-center"><Spinner label="Opening your workspace…"/></div>}
