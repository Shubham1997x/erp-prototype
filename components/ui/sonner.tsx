"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon className="size-4 text-emerald-500" />
        ),
        info: (
          <InfoIcon className="size-4 text-blue-500" />
        ),
        warning: (
          <WarningIcon className="size-4 text-amber-500" />
        ),
        error: (
          <XCircleIcon className="size-4 text-red-500" />
        ),
        loading: (
          <SpinnerIcon className="size-4 animate-spin text-slate-500" />
        ),
      }}
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#0f172a",
          "--normal-border": "#f1f5f9",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans border border-slate-100 shadow-xl rounded-xl p-4 bg-white text-slate-900",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
