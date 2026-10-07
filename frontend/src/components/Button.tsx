import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "accent" | "warning";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
}

export function Button({ variant = "primary", icon: Icon, className, type = "button", children, ...rest }: ButtonProps) {
  const classes = className ? `pf-btn pf-btn--${variant} ${className}` : `pf-btn pf-btn--${variant}`;
  return (
    <button type={type} className={classes} {...rest}>
      {Icon ? <Icon aria-hidden="true" size={17} /> : null}
      {children}
    </button>
  );
}
