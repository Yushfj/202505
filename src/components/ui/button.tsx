"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md",
        outline:
          "border border-purple-500 text-white bg-transparent hover:bg-purple-500 hover:text-white shadow-sm transition-all duration-300 ease-in-out transform hover:scale-105",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        blend: "bg-transparent text-white hover:bg-accent/50 backdrop-blur-md shadow-md border border-accent/40",
        gradient: "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md hover:shadow-lg transition-transform duration-300 ease-in-out transform hover:scale-105", // Style for the gradient button
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean,
  children?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      
        <Comp
          className={cn(buttonVariants({ variant, size, className }),
            "relative overflow-hidden transition-all duration-300", // Add transition to the whole button
            "before:absolute before:inset-0 before:rounded-full before:border-2 before:border-gradient-border before:bg-none before:content-['']", // Gradient border
            "before:transition-all before:duration-300 hover:before:scale-105",
            "hover:scale-105", // Scale up slightly on hover
          )}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      
    );
  }
);
Button.displayName = "Button"

export { Button, buttonVariants }
