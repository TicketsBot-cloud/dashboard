import type { ReactNode } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";

interface LayoutProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}
export function MainLayout(props: LayoutProps) {
  return (
    <div className="px-4 py-4 sm:px-8 md:px-12 md:py-18 lg:px-15">
      <div className="max-w-6xl mx-auto">
        <Breadcrumbs />
        <header className="mb-6 sm:mb-8 md:mb-10">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-1 sm:mb-2 md:mb-4 text-center">
            {props.title}
          </h1>
          {props.subtitle && (
            <p className="text-center text-gray-300 mb-2 sm:mb-4 pb-4 sm:pb-6 md:pb-8 text-sm sm:text-base">
              {props.subtitle}
            </p>
          )}
        </header>

        <div>{props.children}</div>
      </div>
    </div>
  );
}
