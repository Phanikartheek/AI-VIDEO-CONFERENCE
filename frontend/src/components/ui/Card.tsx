import { cn } from '@/utils/cn';
import { type ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl',
        hover && 'hover:bg-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}
