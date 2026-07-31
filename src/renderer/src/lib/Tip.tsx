import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'

/** 自动将 title 转为 shadcn Tooltip 的包装器 */
export function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {React.cloneElement(children, { title: undefined } as any)}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
