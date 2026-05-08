import { ComponentType, SVGProps } from 'react'

export type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>

export interface IconProps extends SVGProps<SVGSVGElement> {
  className?: string
}