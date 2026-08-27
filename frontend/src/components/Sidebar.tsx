import { useEffect, useRef, useState, useCallback, type SyntheticEvent } from "react";
import { guildIconUrl, userAvatarUrl } from "@/lib/discord-cdn";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

import { useAuthStore } from "@/stores/auth";
import { useEntitlementsStore } from "@/stores/entitlements";
import { apiClient } from "@/lib/api";
import { useUIStore } from "@/stores/ui";
import { usePreferencesStore } from "@/stores/preferences";
import { useGuildStore } from "@/stores/guild";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { getAccountRoleLabel } from "@/lib/account-role";
import { isAnyAdmin } from "@/lib/admin-tier";
import { getGuildPermissionLevelLabel } from "@/lib/guild-permission";
import {
  faBell,
  faChevronDown,
  faChevronUp,
  faChevronRight,
  faCog,
  faCrown,
  faHandshake,
  faImages,
  faReceipt,
  faSterlingSign,
} from "@fortawesome/free-solid-svg-icons";
import { getGuildNavLinks, isNavSection, type NavItem, type NavEntry } from "@/lib/navigation";
import { useNotificationStore } from "@/stores/notifications";
import { useNotificationPolling } from "@/hooks/useNotificationPolling";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { PRICING_FLAG } from "@/lib/feature-flags";
import { HoverTooltip } from "@/components/HoverTooltip";

const sidebarIconFrame = "inline-flex h-6 w-6 shrink-0 items-center justify-center";
const sidebarIconClass = "h-5 w-5";
const sidebarAvatarFrame =
  "inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-600";
const dropdownIconFrame = "inline-flex h-5 w-5 shrink-0 items-center justify-center";
const dropdownIconClass = "h-4 w-4";

const SidebarIcon = ({ icon, className = "" }: { icon: IconProp; className?: string }) => (
  <span className={`${sidebarIconFrame} ${className}`}>
    <FontAwesomeIcon icon={icon} className={sidebarIconClass} aria-hidden="true" />
  </span>
);

const Sidebar = () => {
  const { user: userData, logout } = useAuthStore();
  const collapsed = usePreferencesStore((s) => s.layout.sidebarCollapsed);
  const setLayoutPrefs = usePreferencesStore((s) => s.setLayoutPrefs);
  const { mobileMenuOpen, toggleMobileMenu } = useUIStore();

  const toggleSidebar = useCallback(() => {
    setLayoutPrefs({ sidebarCollapsed: !collapsed });
  }, [collapsed, setLayoutPrefs]);
  const { selectedGuild, selectGuild } = useGuildStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const location = useLocation();

  // Poll for unread notification count
  useNotificationPolling();

  // On mobile the drawer is always full-width with labels, regardless of desktop collapsed state
  const showExpanded = !collapsed || mobileMenuOpen;
  const isCollapsedDesktop = collapsed && !mobileMenuOpen;

  // Keyboard navigation for sidebar toggle
  const { handleKeyDown: handleToggleKeyDown } = useKeyboardNavigation({
    onEnter: toggleSidebar,
    onSpace: toggleSidebar,
  });

  // Keyboard navigation for mobile menu toggle
  const { handleKeyDown: handleMobileToggleKeyDown } = useKeyboardNavigation({
    onEnter: toggleMobileMenu,
    onSpace: toggleMobileMenu,
  });

  const { entitlements, legacyEntitlement, hasAnySubscription, hasEntitlementTier } =
    useEntitlementsStore();
  const hasPremium = hasAnySubscription();
  const hasWhitelabel = hasEntitlementTier("whitelabel");
  const { enabled: isPricingEnabled } = useFeatureFlag(PRICING_FLAG);

  // Close mobile menu on route change
  useEffect(() => {
    if (mobileMenuOpen) toggleMobileMenu();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const safeUserData = userData || {
    id: 0,
    username: "discord",
    avatar: "",
    admin_tier: "" as const,
  };

  const accountRoleLabel = selectedGuild
    ? getGuildPermissionLevelLabel(selectedGuild.permission_level)
    : getAccountRoleLabel(safeUserData.admin_tier, entitlements, legacyEntitlement);

  const handleLogout = async () => {
    try {
      await apiClient.auth.logout();
    } catch {
      // proceed with local logout even if the API call fails
    }
    logout();
    window.location.href = "/";
  };

  const linkRowShared =
    "cursor-pointer transition-colors text-white overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset";
  const baseLink = `flex w-full items-center px-4 py-4 text-lg ${linkRowShared}`;
  const iconOnlyLink = `grid w-full place-items-center px-0 py-4 ${linkRowShared}`;
  const footerLink = `flex w-full items-center px-4 py-3 ${linkRowShared}`;
  const footerIconOnlyLink = `grid w-full place-items-center px-0 py-3 ${linkRowShared}`;
  const chromeIconButton =
    "cursor-pointer flex shrink-0 items-center justify-center self-stretch px-3 text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset";

  const rowHover = "hover:bg-gray-700";
  // The active page reads as a muted grey box (not a bright accent fill).
  const rowActive = "bg-gray-700 hover:bg-gray-600";
  // Inactive nav items preview selection on hover with a muted blue tint.
  const navRowHover = "hover:bg-blue-600/20";
  const rowStateClass = (isActive: boolean) => (isActive ? rowActive : navRowHover);
  // Parent of an active child mirrors the active box so it reads as "contains current page".
  const rowBranchStateClass = (containsActive: boolean) =>
    containsActive ? rowActive : navRowHover;

  const [premiumExpanded, setPremiumExpanded] = useState(
    location.pathname.startsWith("/premium") || location.pathname.startsWith("/whitelabel"),
  );
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 });
  const flyoutAnchorRef = useRef<HTMLDivElement>(null);
  const flyoutCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openFlyout = (anchor: HTMLDivElement) => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
    const rect = anchor.getBoundingClientRect();
    setFlyoutPos({ top: rect.top, left: rect.right });
    setFlyoutOpen(true);
  };

  const scheduleFlyoutClose = () => {
    flyoutCloseTimer.current = setTimeout(() => setFlyoutOpen(false), 80);
  };

  const cancelFlyoutClose = () => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
  };

  // Avatar dropdown state
  const [avatarDropdownOpen, setAvatarDropdownOpen] = useState(false);
  const avatarDropdownRef = useRef<HTMLDivElement>(null);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const [avatarDropdownPos, setAvatarDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 200,
  });

  const AVATAR_FLYOUT_WIDTH = 200;
  const VIEWPORT_EDGE_PADDING = 8;
  const AVATAR_FLYOUT_ESTIMATED_HEIGHT = 220;

  const updateCollapsedAvatarFlyoutPosition = useCallback(() => {
    const anchor = avatarButtonRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const menuEl = avatarDropdownRef.current;
    const menuHeight = menuEl?.offsetHeight ?? AVATAR_FLYOUT_ESTIMATED_HEIGHT;
    const menuWidth = menuEl?.offsetWidth ?? AVATAR_FLYOUT_WIDTH;

    // Bottom-align with the trigger so footer menus grow upward, not off-screen
    let top = rect.bottom - menuHeight;
    top = Math.max(
      VIEWPORT_EDGE_PADDING,
      Math.min(top, window.innerHeight - menuHeight - VIEWPORT_EDGE_PADDING),
    );

    let left = rect.right + VIEWPORT_EDGE_PADDING;
    const maxLeft = window.innerWidth - menuWidth - VIEWPORT_EDGE_PADDING;
    if (left > maxLeft) {
      left = Math.max(VIEWPORT_EDGE_PADDING, rect.left - menuWidth - VIEWPORT_EDGE_PADDING);
    }

    setAvatarDropdownPos({ top, left, width: menuWidth });
  }, []);

  const userAvatarSrc =
    safeUserData.id == 0
      ? "https://avatar.iran.liara.run/public"
      : userAvatarUrl(String(safeUserData.id), safeUserData.avatar || null);

  const handleUserAvatarError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.src = "https://avatar.iran.liara.run/public";
  };

  const toggleAvatarDropdown = () => {
    const anchor = avatarButtonRef.current;
    if (!anchor) return;

    if (avatarDropdownOpen) {
      setAvatarDropdownOpen(false);
      return;
    }

    if (isCollapsedDesktop) {
      const rect = anchor.getBoundingClientRect();
      setAvatarDropdownPos({
        top: Math.max(VIEWPORT_EDGE_PADDING, rect.bottom - AVATAR_FLYOUT_ESTIMATED_HEIGHT),
        left: rect.right + VIEWPORT_EDGE_PADDING,
        width: AVATAR_FLYOUT_WIDTH,
      });
    }
    setAvatarDropdownOpen(true);
  };

  // Refine collapsed flyout position once rendered (uses real menu height)
  useEffect(() => {
    if (!avatarDropdownOpen || !isCollapsedDesktop) return;

    const runUpdate = () => {
      updateCollapsedAvatarFlyoutPosition();
      // Second pass after layout so offsetHeight is accurate
      requestAnimationFrame(updateCollapsedAvatarFlyoutPosition);
    };

    const raf = requestAnimationFrame(runUpdate);
    window.addEventListener("resize", runUpdate);
    window.addEventListener("scroll", runUpdate, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", runUpdate);
      window.removeEventListener("scroll", runUpdate, true);
    };
  }, [avatarDropdownOpen, isCollapsedDesktop, updateCollapsedAvatarFlyoutPosition]);

  const renderAvatarMenuItems = (options: { showHeader: boolean }) => (
    <>
      {options.showHeader && (
        <div className="flex items-center gap-3 border-b border-gray-700 px-3 py-2.5">
          <span className={sidebarAvatarFrame}>
            <img
              src={userAvatarSrc}
              alt=""
              className="h-full w-full object-cover"
              onError={handleUserAvatarError}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{safeUserData.username}</p>
            <p className="text-xs text-gray-400">{accountRoleLabel}</p>
          </div>
        </div>
      )}
      <div className="p-1.5">
        <Link
          to="/settings"
          onClick={() => setAvatarDropdownOpen(false)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          role="menuitem"
        >
          <span className={dropdownIconFrame}>
            <FontAwesomeIcon
              icon={faCog}
              className={`${dropdownIconClass} text-gray-400`}
              aria-hidden="true"
            />
          </span>
          Settings
        </Link>
        <button
          type="button"
          onClick={() => {
            setAvatarDropdownOpen(false);
            handleLogout();
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          role="menuitem"
        >
          <span className={dropdownIconFrame}>
            <FontAwesomeIcon
              icon="sign-out-alt"
              className={`${dropdownIconClass} text-red-300`}
              aria-hidden="true"
            />
          </span>
          Log out
        </button>
      </div>
    </>
  );

  // Close avatar dropdown on click outside or Escape
  useEffect(() => {
    if (!avatarDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        avatarDropdownRef.current &&
        !avatarDropdownRef.current.contains(e.target as Node) &&
        avatarButtonRef.current &&
        !avatarButtonRef.current.contains(e.target as Node)
      ) {
        setAvatarDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [avatarDropdownOpen]);

  // Focus the first menu item when the avatar dropdown opens
  useEffect(() => {
    if (!avatarDropdownOpen) return;
    // Defer to let the portal render
    const raf = requestAnimationFrame(() => {
      const firstItem = avatarDropdownRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [avatarDropdownOpen]);

  // Keyboard navigation inside the avatar dropdown menu
  const handleAvatarMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const menu = avatarDropdownRef.current;
    if (!menu) return;

    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prev]?.focus();
    } else if (e.key === "Tab") {
      setAvatarDropdownOpen(false);
      avatarButtonRef.current?.focus();
    }
  }, []);

  // Close avatar dropdown on route change
  useEffect(() => {
    setAvatarDropdownOpen(false);
  }, [location.pathname]);

  const premiumChildren: NavItem[] = [
    // Pricing is gated: showing the link while the route redirects away would be
    // a dead entry. Undefined during load, so the link appears once flags arrive
    // rather than flashing in and out.
    ...(isPricingEnabled
      ? [{ to: "/premium/pricing", icon: faSterlingSign, label: "Pricing" } as NavItem]
      : []),
    ...(hasPremium
      ? [{ to: "/premium/subscription", icon: faReceipt, label: "Subscription" } as NavItem]
      : []),
    ...(hasWhitelabel
      ? [{ to: "/whitelabel", icon: "edit" as IconProp, label: "Whitelabel" } as NavItem]
      : []),
  ];

  const defaultNavLinks: NavItem[] = [
    { to: "/", icon: "server" as IconProp, label: "Servers" },
    { to: "/gallery", icon: faImages, label: "Gallery" },
    {
      to: "/premium",
      icon: faCrown,
      label: "Premium",
      children: premiumChildren,
    },
    { to: "/affiliate", icon: faHandshake, label: "Affiliate" },
  ];

  const guildNavLinks: NavEntry[] = selectedGuild ? getGuildNavLinks(selectedGuild.id) : [];

  const navLinks: NavEntry[] = selectedGuild ? guildNavLinks : defaultNavLinks;

  const isActiveLink = (to: string, label: string) => {
    if (to === "/" && location.pathname === "/") return true;
    if (label === "Overview") return location.pathname === to;
    if (to !== "/" && location.pathname.startsWith(to)) return true;
    return false;
  };

  const isAdminActive = location.pathname.startsWith("/admin");
  const isNotificationsActive = location.pathname === "/notifications";

  return (
    <>
      {/* Mobile hamburger button - always z-50 so the sidebar (z-50) physically slides over/away from it */}
      <div className="block md:hidden fixed top-4 left-4 z-50">
        <button
          type="button"
          onClick={toggleMobileMenu}
          onKeyDown={handleMobileToggleKeyDown}
          className="cursor-pointer w-10 h-10 flex items-center justify-center bg-gray-800 border border-gray-600 text-blue-400 rounded-lg shadow-md hover:bg-gray-700 hover:border-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          title={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenuOpen}
          aria-controls="navigation"
        >
          <FontAwesomeIcon
            icon={mobileMenuOpen ? "times" : "bars"}
            className={sidebarIconClass}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-55 transition-opacity md:hidden ${
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={toggleMobileMenu}
        aria-hidden="true"
      />

      <aside
        id="navigation"
        className={`
          fixed top-0 left-0 h-screen bg-gray-800 text-white z-58 flex flex-col
          transform transition-all duration-300 ease-in-out
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:sticky md:top-0 md:h-screen md:z-auto md:shrink-0
          w-64 ${collapsed ? "md:w-20" : ""}
        `}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Desktop header - only when no guild is selected */}
        {!selectedGuild && (
          <div
            className={`hidden md:flex shrink-0 w-full ${collapsed ? "" : "items-center justify-end p-4"}`}
          >
            <HoverTooltip
              label="Expand navigation menu"
              enabled={collapsed}
              className={collapsed ? "relative block w-full" : "relative"}
            >
              <button
                type="button"
                onClick={toggleSidebar}
                onKeyDown={handleToggleKeyDown}
                className={
                  collapsed
                    ? `${iconOnlyLink} ${rowHover}`
                    : "cursor-pointer text-white p-2 hover:bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                }
                aria-label={collapsed ? "Expand navigation menu" : "Collapse navigation menu"}
                title={collapsed ? undefined : "Collapse navigation menu"}
                aria-expanded={!collapsed}
                aria-controls="navigation-links"
              >
                {collapsed ? (
                  <SidebarIcon icon="right-to-bracket" />
                ) : (
                  <FontAwesomeIcon
                    icon="square-caret-left"
                    className={sidebarIconClass}
                    aria-hidden="true"
                  />
                )}
              </button>
            </HoverTooltip>
          </div>
        )}

        {/* Guild context: header + back (fixed); single divider before scrollable nav */}
        {selectedGuild ? (
          <div className="shrink-0 border-b border-gray-700">
            {isCollapsedDesktop && (
              <HoverTooltip
                label="Expand navigation menu"
                enabled
                className="relative block w-full"
              >
                <button
                  type="button"
                  onClick={toggleSidebar}
                  onKeyDown={handleToggleKeyDown}
                  className={`${iconOnlyLink} ${rowHover}`}
                  aria-label="Expand navigation menu"
                  aria-expanded={!collapsed}
                  aria-controls="navigation-links"
                >
                  <SidebarIcon icon="right-to-bracket" />
                </button>
              </HoverTooltip>
            )}
            {showExpanded && (
              <div className="px-4 py-2">
                <div className="flex items-stretch gap-2">
                  <div className="flex min-h-12 flex-1 items-center bg-gray-700 p-2 rounded-xl min-w-0">
                    {selectedGuild.icon && (
                      <img
                        src={guildIconUrl(selectedGuild.id, selectedGuild.icon)}
                        alt={`${selectedGuild.name} icon`}
                        className="w-6 h-6 rounded-full mr-3 shrink-0"
                      />
                    )}
                    <span className="text-white font-semibold text-sm truncate">
                      {selectedGuild.name}
                    </span>
                  </div>
                  {/* Mobile: close drawer */}
                  <button
                    type="button"
                    onClick={toggleMobileMenu}
                    className={`${chromeIconButton} md:hidden`}
                    aria-label="Close navigation menu"
                    title="Close navigation menu"
                  >
                    <SidebarIcon icon="square-caret-left" />
                  </button>
                  {/* Desktop: collapse sidebar */}
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    onKeyDown={handleToggleKeyDown}
                    className={`${chromeIconButton} hidden md:flex`}
                    aria-label="Collapse navigation menu"
                    title="Collapse navigation menu"
                    aria-expanded={!collapsed}
                    aria-controls="navigation-links"
                  >
                    <SidebarIcon icon="square-caret-left" />
                  </button>
                </div>
              </div>
            )}
            <HoverTooltip
              label="Back to Servers"
              enabled={isCollapsedDesktop}
              className="relative w-full"
            >
              <Link
                to="/"
                onClick={() => {
                  selectGuild(null);
                  if (mobileMenuOpen) toggleMobileMenu();
                }}
                className={`${isCollapsedDesktop ? iconOnlyLink : baseLink} ${rowHover}`}
                aria-label={isCollapsedDesktop ? "Back to Servers" : undefined}
              >
                {showExpanded ? (
                  <span className="ml-4 flex items-center gap-3 whitespace-nowrap">
                    <SidebarIcon icon="arrow-left" />
                    <span>Back to Servers</span>
                  </span>
                ) : (
                  <SidebarIcon icon="arrow-left" />
                )}
              </Link>
            </HoverTooltip>
          </div>
        ) : (
          /* Mobile-only: X button row when no guild is selected */
          <div className="md:hidden flex justify-end px-4 py-3 border-b border-gray-700">
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="cursor-pointer w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close navigation menu"
              title="Close navigation menu"
            >
              <FontAwesomeIcon icon="times" className={sidebarIconClass} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Navigation links */}
        <nav id="navigation-links" className="flex-1 overflow-y-auto overflow-x-hidden" role="list">
          {(() => {
            const permLevel = selectedGuild?.permission_level ?? 0;

            const renderNavItem = (item: NavItem) => {
              // Items with children render as an expandable group
              if (item.children && item.children.length > 0) {
                const isAnyChildActive = item.children.some((c) => isActiveLink(c.to, c.label));
                return (
                  <div key={item.to} role="listitem">
                    <div
                      ref={flyoutAnchorRef}
                      className="relative"
                      onMouseEnter={() => {
                        if (!isCollapsedDesktop || !flyoutAnchorRef.current) return;
                        openFlyout(flyoutAnchorRef.current);
                      }}
                      onMouseLeave={() => isCollapsedDesktop && scheduleFlyoutClose()}
                    >
                      <button
                        onClick={() => {
                          if (isCollapsedDesktop) {
                            if (flyoutOpen && flyoutAnchorRef.current) {
                              scheduleFlyoutClose();
                            } else if (flyoutAnchorRef.current) {
                              openFlyout(flyoutAnchorRef.current);
                            }
                          } else {
                            setPremiumExpanded((prev) => !prev);
                          }
                        }}
                        type="button"
                        className={`${
                          isCollapsedDesktop ? iconOnlyLink : baseLink
                        } ${rowBranchStateClass(isAnyChildActive)}`}
                        aria-label={isCollapsedDesktop ? item.label : undefined}
                        aria-expanded={premiumExpanded}
                      >
                        {showExpanded ? (
                          <span className="ml-4 flex flex-1 items-center gap-3 whitespace-nowrap">
                            <SidebarIcon icon={item.icon} />
                            <span>{item.label}</span>
                            <FontAwesomeIcon
                              icon={premiumExpanded ? faChevronDown : faChevronRight}
                              className="ml-auto h-3 w-3 text-gray-400"
                              aria-hidden="true"
                            />
                          </span>
                        ) : (
                          <SidebarIcon icon={item.icon} />
                        )}
                      </button>
                    </div>
                    {isCollapsedDesktop &&
                      flyoutOpen &&
                      createPortal(
                        <div
                          className="fixed py-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-44 z-9999"
                          style={{ top: flyoutPos.top, left: flyoutPos.left }}
                          onMouseEnter={cancelFlyoutClose}
                          onMouseLeave={scheduleFlyoutClose}
                        >
                          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            {item.label}
                          </div>
                          {item.children.map((child) => {
                            const isChildActive = isActiveLink(child.to, child.label);
                            return (
                              <Link
                                key={child.to}
                                to={child.to}
                                onClick={() => setFlyoutOpen(false)}
                                className={`cursor-pointer flex items-center gap-2 px-3 py-2 text-sm text-white transition-colors whitespace-nowrap ${rowStateClass(
                                  isChildActive,
                                )}`}
                              >
                                <FontAwesomeIcon
                                  icon={child.icon}
                                  className="h-4 w-4 text-gray-400"
                                  aria-hidden="true"
                                />
                                {child.label}
                              </Link>
                            );
                          })}
                          <div className="absolute right-full top-3 border-4 border-transparent border-r-gray-600" />
                          <div className="absolute right-full top-3 border-3 border-transparent border-r-gray-800 translate-x-px" />
                        </div>,
                        document.body,
                      )}
                    {premiumExpanded && showExpanded && (
                      <div className="ml-4">
                        {item.children.map((child) => {
                          const isChildActive = isActiveLink(child.to, child.label);
                          return (
                            <div key={child.to} className="relative group">
                              <Link
                                to={child.to}
                                onClick={() => {
                                  if (mobileMenuOpen) toggleMobileMenu();
                                }}
                                className={`${baseLink} text-base py-3 ${rowStateClass(
                                  isChildActive,
                                )}`}
                                aria-current={isChildActive ? "page" : undefined}
                              >
                                <span className="ml-4 flex items-center gap-3 whitespace-nowrap">
                                  <SidebarIcon icon={child.icon} />
                                  <span>{child.label}</span>
                                </span>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Regular items (no children)
              const isActive = isActiveLink(item.to, item.label);
              return (
                <HoverTooltip
                  key={item.to}
                  label={item.label}
                  enabled={isCollapsedDesktop}
                  className="relative"
                  role="listitem"
                >
                  <Link
                    to={item.to}
                    onClick={() => {
                      if (mobileMenuOpen) toggleMobileMenu();
                    }}
                    className={`${
                      isCollapsedDesktop ? iconOnlyLink : baseLink
                    } ${rowStateClass(isActive)}`}
                    aria-label={isCollapsedDesktop ? item.label : undefined}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {showExpanded ? (
                      <span className="ml-4 flex items-center gap-3 whitespace-nowrap">
                        <SidebarIcon icon={item.icon} />
                        <span>{item.label}</span>
                      </span>
                    ) : (
                      <SidebarIcon icon={item.icon} />
                    )}
                  </Link>
                </HoverTooltip>
              );
            };

            return navLinks.map((entry) => {
              if (isNavSection(entry)) {
                const visibleItems = entry.items.filter(
                  (item) => permLevel >= (item.permission_level_needed ?? 0),
                );
                if (visibleItems.length === 0) return null;
                return (
                  <div key={entry.label} role="group" aria-label={entry.label}>
                    {showExpanded ? (
                      <div className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {entry.label}
                      </div>
                    ) : (
                      <hr className="my-1 mx-3 border-gray-700" />
                    )}
                    {visibleItems.map(renderNavItem)}
                  </div>
                );
              }

              // Standalone NavItem (default nav items)
              const item = entry as NavItem;
              if (permLevel < (item.permission_level_needed ?? 0)) return null;
              return renderNavItem(item);
            });
          })()}
        </nav>

        {/* Footer: admin, logout, user */}
        <div className="border-t border-gray-700" role="contentinfo">
          {isAnyAdmin(safeUserData.admin_tier) && (
            <HoverTooltip label="Admin panel" enabled={isCollapsedDesktop} className="relative">
              <Link
                to={`/admin/${safeUserData.admin_tier == "helper" ? "gallery" : "bot-staff"}`}
                className={`${
                  isCollapsedDesktop ? footerIconOnlyLink : footerLink
                } ${rowStateClass(isAdminActive)}`}
                aria-label={isCollapsedDesktop ? "Admin panel" : undefined}
                aria-current={isAdminActive ? "page" : undefined}
              >
                {showExpanded ? (
                  <span className="ml-4 flex items-center gap-3 whitespace-nowrap">
                    <SidebarIcon icon="user-secret" />
                    <span>Admin</span>
                  </span>
                ) : (
                  <SidebarIcon icon="user-secret" />
                )}
              </Link>
            </HoverTooltip>
          )}

          {/* Bell icon - notifications */}
          <HoverTooltip
            label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
            enabled={isCollapsedDesktop}
            className="relative"
          >
            <Link
              to="/notifications"
              onClick={() => {
                if (mobileMenuOpen) toggleMobileMenu();
              }}
              className={`${
                isCollapsedDesktop ? footerIconOnlyLink : footerLink
              } ${rowStateClass(isNotificationsActive)}`}
              aria-label={
                unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
              }
              aria-current={isNotificationsActive ? "page" : undefined}
            >
              {showExpanded ? (
                <span className="ml-4 flex items-center gap-3 whitespace-nowrap">
                  <span className={`${sidebarIconFrame} relative`}>
                    <FontAwesomeIcon
                      icon={faBell}
                      className={sidebarIconClass}
                      aria-hidden="true"
                    />
                    {unreadCount > 0 && (
                      <span
                        className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-medium bg-blue-600 text-white rounded-full">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </span>
                </span>
              ) : (
                <span className={`${sidebarIconFrame} relative`}>
                  <FontAwesomeIcon icon={faBell} className={sidebarIconClass} aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span
                      className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"
                      aria-hidden="true"
                    />
                  )}
                </span>
              )}
            </Link>
          </HoverTooltip>

          {/* User account */}
          <div className={showExpanded ? "p-2" : ""}>
            <HoverTooltip
              label={`${safeUserData.username} — Account menu`}
              enabled={isCollapsedDesktop}
              className="relative"
              role="banner"
              aria-label="Current user"
            >
              <div
                className={
                  showExpanded
                    ? "overflow-hidden rounded-lg border border-gray-700/80 bg-gray-900/50"
                    : ""
                }
              >
                <button
                  ref={avatarButtonRef}
                  type="button"
                  onClick={toggleAvatarDropdown}
                  className={
                    showExpanded
                      ? `cursor-pointer flex w-full items-center gap-3 px-3 py-2.5 text-left text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
                          avatarDropdownOpen ? "bg-gray-800" : "hover:bg-gray-800"
                        }`
                      : `${footerIconOnlyLink} ${avatarDropdownOpen ? "bg-gray-700" : rowHover}`
                  }
                  aria-expanded={avatarDropdownOpen}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${safeUserData.username}`}
                >
                  {showExpanded ? (
                    <>
                      <span className={sidebarAvatarFrame}>
                        <img
                          src={userAvatarSrc}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={handleUserAvatarError}
                        />
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-medium">
                          {safeUserData.username}
                        </span>
                        <span className="block text-xs text-gray-400">{accountRoleLabel}</span>
                      </span>
                      <FontAwesomeIcon
                        icon={avatarDropdownOpen ? faChevronUp : faChevronDown}
                        className="h-3 w-3 shrink-0 text-gray-400"
                        aria-hidden="true"
                      />
                    </>
                  ) : (
                    <span className={sidebarAvatarFrame}>
                      <img
                        src={userAvatarSrc}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={handleUserAvatarError}
                      />
                    </span>
                  )}
                </button>

                {avatarDropdownOpen && showExpanded && (
                  <div
                    ref={avatarDropdownRef}
                    className="border-t border-gray-700"
                    role="menu"
                    aria-label="Account menu"
                    tabIndex={-1}
                    onKeyDown={handleAvatarMenuKeyDown}
                  >
                    {renderAvatarMenuItems({ showHeader: false })}
                  </div>
                )}
              </div>
            </HoverTooltip>
          </div>
        </div>
      </aside>

      {/* Collapsed sidebar: flyout account menu */}
      {avatarDropdownOpen &&
        isCollapsedDesktop &&
        createPortal(
          <div
            ref={avatarDropdownRef}
            className="fixed z-9999 overflow-hidden rounded-lg border border-gray-600 bg-gray-800 shadow-xl"
            style={{
              top: avatarDropdownPos.top,
              left: avatarDropdownPos.left,
              width: avatarDropdownPos.width || AVATAR_FLYOUT_WIDTH,
            }}
            role="menu"
            aria-label="Account menu"
            tabIndex={-1}
            onKeyDown={handleAvatarMenuKeyDown}
          >
            {renderAvatarMenuItems({ showHeader: true })}
          </div>,
          document.body,
        )}
    </>
  );
};

export default Sidebar;
