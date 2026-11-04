import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Link, type LinkProps } from "react-router";

import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-pine-800 text-white hover:bg-pine-900 disabled:bg-pine-800/60 shadow-sm border border-pine-900/20",
  secondary:
    "bg-surface text-ink-900 border border-line-strong hover:bg-paper disabled:text-ink-400",
  ghost: "text-ink-700 hover:bg-ink-900/5 disabled:text-ink-400",
  danger: "bg-rose-ink text-white hover:bg-[#87182b] disabled:opacity-60 shadow-sm",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export function buttonClasses(
  variant: Variant = "secondary",
  size: Size = "md",
  extra = "",
): string {
  return `inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  className = "",
  children,
  disabled,
  type,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends Omit<LinkProps, "className"> {
  className?: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  );
}
