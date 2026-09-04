import { type FC, type FormEvent, useState, useCallback, useEffect } from "react";
import { Outlet, useParams, useNavigate, Link } from "react-router";
import { HelmetProvider } from "react-helmet-async";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { SkeletonTheme } from "react-loading-skeleton";
import { BRANDING_FOOTER_TEXT, WEBSITE_URL } from "@/lib/constants";
import { usePublicKBInfo } from "@/hooks/queries/usePublicKB";
import type { KBGuildInfo } from "@/types";
import "react-loading-skeleton/dist/skeleton.css";

type KBGuildInfoCustomisation = KBGuildInfo["customisation"];

const KBHeader: FC<{ customisation?: KBGuildInfoCustomisation }> = ({ customisation }) => {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const { data: guildInfo } = usePublicKBInfo(guildId);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = searchQuery.trim();
      if (trimmed && guildId) {
        navigate(`/kb/${guildId}/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [searchQuery, guildId, navigate],
  );

  return (
    <header className="bg-(--kb-card) border-b border-white/10" role="banner">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center gap-4">
        <Link
          to={`/kb/${guildId}`}
          className="flex items-center gap-3 shrink-0 text-(--kb-text) hover:text-(--kb-text)/80 transition-colors"
          aria-label={guildInfo ? `${guildInfo.name} Knowledge Base home` : "Knowledge Base home"}
        >
          {customisation?.logo_url ? (
            <img
              src={customisation.logo_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
              aria-hidden="true"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : guildInfo?.icon_url ? (
            <img
              src={guildInfo.icon_url}
              alt=""
              className="w-8 h-8 rounded-full"
              aria-hidden="true"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-medium text-(--kb-text)/70"
              aria-hidden="true"
            >
              {guildInfo?.name?.charAt(0) ?? "?"}
            </div>
          )}
          <span className="text-lg font-semibold">{guildInfo?.name ?? "Knowledge Base"}</span>
        </Link>

        <form
          onSubmit={handleSearch}
          role="search"
          aria-label="Search knowledge base"
          className="flex-1 w-full sm:max-w-md"
        >
          <div className="relative">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-(--kb-text)/50 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles..."
              aria-label="Search knowledge base articles"
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/15 rounded-lg text-(--kb-text) placeholder-(--kb-text)/40 focus:outline-none focus:ring-2 focus:ring-(--kb-accent) focus:border-transparent"
            />
          </div>
        </form>
      </div>
    </header>
  );
};

const KBErrorState: FC = () => (
  <div className="min-h-screen bg-gray-900 flex items-center justify-center" role="alert">
    <div className="text-center px-4">
      <h1 className="text-2xl font-bold text-white mb-2">Knowledge Base not found</h1>
      <p className="text-gray-300">
        This knowledge base does not exist or is not publicly available.
      </p>
    </div>
  </div>
);

const KBLayoutInner: FC = () => {
  const { guildId } = useParams<{ guildId: string }>();
  const { data: guildInfo, isError } = usePublicKBInfo(guildId);

  const customisation = guildInfo?.customisation;

  const themeStyle: React.CSSProperties = {
    "--kb-bg": customisation?.primary_bg ?? "#111827",
    "--kb-card": customisation?.card_bg ?? "#1F2937",
    "--kb-text": customisation?.text_colour ?? "#FFFFFF",
    "--kb-accent": customisation?.accent_colour ?? "#3B82F6",
  } as React.CSSProperties;

  // Override the dashboard's body overflow:hidden so KB pages can scroll naturally
  useEffect(() => {
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.height = "auto";
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    return () => {
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
      document.body.style.overflow = "";
      document.body.style.height = "";
    };
  }, []);

  if (isError) {
    return <KBErrorState />;
  }

  return (
    <div style={themeStyle} className="min-h-screen bg-(--kb-bg) flex flex-col">
      <a
        href="#kb-main-content"
        className="sr-only focus:not-sr-only absolute top-0 left-0 z-50 bg-(--kb-accent) text-white px-4 py-2 rounded-br-md focus:outline-none focus:ring-2 focus:ring-(--kb-accent) focus:ring-offset-2"
      >
        Skip to main content
      </a>

      <KBHeader customisation={customisation} />

      <main id="kb-main-content" className="flex-1" role="main">
        <Outlet />
      </main>

      {!customisation?.hide_branding && (
        <footer className="bg-(--kb-card) border-t border-white/10 py-4" role="contentinfo">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--kb-text)/50 text-sm hover:text-(--kb-text)/70 transition-colors"
            >
              {BRANDING_FOOTER_TEXT}
            </a>
          </div>
        </footer>
      )}
    </div>
  );
};

const KBLayout: FC = () => {
  return (
    <HelmetProvider>
      <SkeletonTheme baseColor="#374151" highlightColor="#4B5563">
        <KBLayoutInner />
      </SkeletonTheme>
    </HelmetProvider>
  );
};

export default KBLayout;
