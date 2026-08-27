import { useState, useEffect, useCallback, useId } from "react";
import { MainLayout } from "@/pages/layout/Main";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faCheckCircle,
  faExclamationTriangle,
  faTrash,
  faBell,
} from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import Slider from "@/components/Slider";
import ConfirmModal from "@/components/modals/ConfirmModal";
import SettingsSkeleton from "@/components/skeletons/SettingsSkeleton";
import Table from "@/components/Table";
import { getAdminTierLabel } from "@/lib/admin-tier";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { AdminTier, NotificationPreference, UserSettings } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────────

type NotificationChannel = "in_app" | "discord_dm" | "email";

interface LocalNotificationPreference {
  category: string;
  channels: Record<NotificationChannel, boolean>;
}

interface CategoryDisplayInfo {
  category: string;
  label: string;
  description: string;
  minTier: AdminTier;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In-app",
  discord_dm: "Discord DM",
  email: "Email",
};

const CHANNEL_ORDER: NotificationChannel[] = ["in_app", "discord_dm", "email"];

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Convert API NotificationPreference[] to local shape with channels map */
function toLocalPreferences(prefs: NotificationPreference[]): LocalNotificationPreference[] {
  return prefs.map((p) => ({
    category: p.category,
    channels: {
      in_app: p.in_app,
      discord_dm: p.discord_dm,
      email: p.email,
    },
  }));
}

/** Convert local preferences back to API shape */
function toApiPreferences(prefs: LocalNotificationPreference[]): NotificationPreference[] {
  return prefs.map((p) => ({
    category: p.category,
    discord_dm: p.channels.discord_dm,
    email: p.channels.email,
    in_app: p.channels.in_app,
  }));
}

/** Badge marking a category that only bot admins can see. */
function TierBadge({ minTier }: { minTier: AdminTier }) {
  const label = getAdminTierLabel(minTier);
  if (!label) return null;

  return (
    <span className="inline-flex items-center text-xs text-purple-300 bg-purple-400/10 px-2 py-0.5 rounded shrink-0">
      {label} only
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function UserSettings() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // Email management state
  const [emailInput, setEmailInput] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [showRemoveEmailModal, setShowRemoveEmailModal] = useState(false);
  const [removingEmail, setRemovingEmail] = useState(false);

  // Notification preferences state
  const [preferences, setPreferences] = useState<LocalNotificationPreference[]>([]);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesChanged, setPreferencesChanged] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiClient.settings.get();
      const data = res.data;
      setSettings(data);
      setPreferences(toLocalPreferences(data.notification_preferences));
    } catch {
      // Interceptor handles error display
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ─── Email handlers ─────────────────────────────────────────────────────────

  const handleSaveEmail = async () => {
    if (!emailInput.trim()) return;
    setSavingEmail(true);
    try {
      await apiClient.settings.updateEmail(emailInput.trim());
      setSettings((prev) =>
        prev ? { ...prev, email: emailInput.trim(), email_verified: false } : prev,
      );
      setShowVerification(true);
      toast.success("Verification code sent to your email address.");
    } catch {
      // Interceptor handles error display
    } finally {
      setSavingEmail(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (verificationCode.trim().length !== 6) return;
    setVerifying(true);
    try {
      await apiClient.settings.verifyEmail(verificationCode.trim());
      setSettings((prev) => (prev ? { ...prev, email_verified: true } : prev));
      setShowVerification(false);
      setVerificationCode("");
      toast.success("Email verified successfully.");
    } catch {
      // Interceptor handles error display
    } finally {
      setVerifying(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    try {
      await apiClient.settings.resendVerification();
      toast.success("Verification code sent. Please check your inbox.");
    } catch {
      // Interceptor handles error display
    } finally {
      setResending(false);
    }
  };

  const handleRemoveEmail = async () => {
    setRemovingEmail(true);
    try {
      await apiClient.settings.deleteEmail();
      setSettings((prev) => (prev ? { ...prev, email: null, email_verified: false } : prev));
      setEmailInput("");
      setShowVerification(false);
      setShowRemoveEmailModal(false);
      toast.success("Email address removed.");
    } catch {
      // Interceptor handles error display
    } finally {
      setRemovingEmail(false);
    }
  };

  // ─── Notification preference handlers ───────────────────────────────────────

  const handleTogglePreference = (
    category: string,
    channel: NotificationChannel,
    value: boolean,
  ) => {
    setPreferences((prev) =>
      prev.map((p) =>
        p.category === category ? { ...p, channels: { ...p.channels, [channel]: value } } : p,
      ),
    );
    setPreferencesChanged(true);
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    try {
      await apiClient.settings.updateNotificationPreferences(toApiPreferences(preferences));
      setPreferencesChanged(false);
      toast.success("Notification preferences saved.");
    } catch {
      // Interceptor handles error display
    } finally {
      setSavingPreferences(false);
    }
  };

  if (loading) {
    return (
      <MainLayout title="Settings" subtitle="Manage your account and notification preferences">
        <SettingsSkeleton />
      </MainLayout>
    );
  }

  // Already filtered by tier server-side. Not re-filtered here: `user.admin_tier` is
  // set at login and never refreshed, so it would go stale after a promotion.
  const visibleCategories: CategoryDisplayInfo[] = (settings?.notification_categories ?? []).map(
    (c) => ({
      category: c.key,
      label: c.label,
      description: c.description,
      minTier: c.min_tier,
    }),
  );

  const hasEmail = !!settings?.email;
  const emailVerified = !!settings?.email_verified;

  return (
    <MainLayout title="Settings" subtitle="Manage your account and notification preferences">
      <div className="space-y-8">
        {/* ─── Email Section ──────────────────────────────────────────────── */}
        <section aria-labelledby="email-heading">
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon icon={faEnvelope} className="text-blue-400" aria-hidden="true" />
              <h2 id="email-heading" className="text-lg font-semibold text-white">
                Email Address
              </h2>
            </div>

            <p className="text-sm text-gray-300 mb-4">
              Add an email address to receive notifications via email. Your email will never be used
              for marketing purposes.
            </p>

            {/* Current email display */}
            {hasEmail && !showVerification && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-white text-sm truncate">{settings.email}</span>
                  {emailVerified ? (
                    <span
                      role="status"
                      aria-label="Email verified"
                      className="inline-flex items-center gap-1 text-xs text-green-300 bg-green-400/10 px-2 py-0.5 rounded shrink-0"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} aria-hidden="true" />
                      Verified
                    </span>
                  ) : (
                    <span
                      role="status"
                      aria-label="Email not verified"
                      className="inline-flex items-center gap-1 text-xs text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded shrink-0"
                    >
                      <FontAwesomeIcon icon={faExclamationTriangle} aria-hidden="true" />
                      Not verified
                    </span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {!emailVerified && (
                    <Button variant="primary" size="sm" onClick={() => setShowVerification(true)}>
                      Verify
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowRemoveEmailModal(true)}
                    title="Remove email address"
                  >
                    <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                    <span className="sr-only">Remove email address</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Verification flow */}
            {hasEmail && showVerification && !emailVerified && (
              <div
                role="region"
                aria-label="Email verification"
                className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-5 mb-4"
              >
                <h3 className="text-sm font-medium text-amber-400 mb-2">
                  Verify your email address
                </h3>
                <p className="text-xs text-gray-300 mb-3">
                  A verification code has been sent to{" "}
                  <strong className="text-white">{settings.email}</strong>. Enter the 6-digit code
                  below.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2">
                  <div className="w-full sm:w-auto sm:max-w-45">
                    <TextInput
                      label="Verification code"
                      value={verificationCode}
                      onChange={setVerificationCode}
                      placeholder="6-digit code"
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleVerifyEmail}
                    disabled={verifying || verificationCode.trim().length !== 6}
                    className="h-10.5 w-full sm:w-auto"
                  >
                    {verifying ? "Verifying..." : "Verify"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="whitespace-nowrap h-10.5 flex items-center"
                  >
                    {resending ? "Sending..." : "Resend code"}
                  </Button>
                </div>
              </div>
            )}

            {/* Add / change email form */}
            {(!hasEmail || emailVerified) && (
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                <div className="flex-1 w-full sm:w-auto">
                  <TextInput
                    label={hasEmail ? "Change email address" : "Add email address"}
                    value={emailInput}
                    onChange={setEmailInput}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={handleSaveEmail}
                  disabled={savingEmail || !emailInput.trim()}
                  className="h-10.5 w-full sm:w-auto"
                >
                  {savingEmail ? "Saving..." : hasEmail ? "Update Email" : "Add Email"}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* ─── Notification Preferences Section ──────────────────────────── */}
        <section aria-labelledby="notifications-heading">
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon icon={faBell} className="text-blue-400" aria-hidden="true" />
              <h2 id="notifications-heading" className="text-lg font-semibold text-white">
                Notification Preferences
              </h2>
            </div>

            <p className="text-sm text-gray-300 mb-6">
              Choose how you would like to be notified for each category. Email notifications
              require a verified email address.
            </p>

            {/* Desktop: table layout */}
            <div className="hidden md:block">
              <PreferencesTable
                categories={visibleCategories}
                preferences={preferences}
                hasVerifiedEmail={hasEmail && emailVerified}
                onToggle={handleTogglePreference}
              />
            </div>

            {/* Mobile: card layout */}
            <div className="md:hidden space-y-4">
              {visibleCategories.map((categoryInfo) => {
                const pref = preferences.find((p) => p.category === categoryInfo.category);
                if (!pref) return null;
                return (
                  <PreferenceCard
                    key={categoryInfo.category}
                    categoryInfo={categoryInfo}
                    preference={pref}
                    hasVerifiedEmail={hasEmail && emailVerified}
                    onToggle={handleTogglePreference}
                  />
                );
              })}
            </div>

            {/* Save button */}
            {preferencesChanged && (
              <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
                <Button
                  variant="primary"
                  onClick={handleSavePreferences}
                  disabled={savingPreferences}
                  className="rounded-lg font-medium px-6"
                >
                  {savingPreferences ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Remove email confirmation modal */}
      <ConfirmModal
        isOpen={showRemoveEmailModal}
        title="Remove Email Address"
        message={
          <div className="space-y-2">
            <p className="text-sm">
              Are you sure you want to remove your email address? You will no longer receive email
              notifications.
            </p>
            {settings?.email && (
              <p className="text-sm text-gray-300">
                Email: <strong className="text-white">{settings.email}</strong>
              </p>
            )}
          </div>
        }
        confirmText={removingEmail ? "Removing..." : "Remove Email"}
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleRemoveEmail}
        onCancel={() => setShowRemoveEmailModal(false)}
      />
    </MainLayout>
  );
}

// ─── Desktop table layout ───────────────────────────────────────────────────────

function PreferencesTable({
  categories,
  preferences,
  hasVerifiedEmail,
  onToggle,
}: {
  categories: CategoryDisplayInfo[];
  preferences: LocalNotificationPreference[];
  hasVerifiedEmail: boolean;
  onToggle: (category: string, channel: NotificationChannel, value: boolean) => void;
}) {
  return (
    <Table variant="compact">
      <Table.Head className="bg-gray-900/50">
        <Table.Row>
          <Table.HeaderCell className="px-4 py-3 w-1/3">Category</Table.HeaderCell>
          {CHANNEL_ORDER.map((channel) => (
            <Table.HeaderCell key={channel} className="px-4 py-3 text-center">
              {CHANNEL_LABELS[channel]}
            </Table.HeaderCell>
          ))}
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {categories.map((categoryInfo) => {
          const pref = preferences.find((p) => p.category === categoryInfo.category);
          if (!pref) return null;
          return (
            <Table.Row key={categoryInfo.category} className="border-b border-gray-700">
              <Table.HeaderCell scope="row" className="px-4 py-4 font-normal">
                <div>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-white font-medium">{categoryInfo.label}</span>
                    <TierBadge minTier={categoryInfo.minTier} />
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">{categoryInfo.description}</p>
                </div>
              </Table.HeaderCell>
              {CHANNEL_ORDER.map((channel) => {
                const enabled = pref.channels[channel];
                const emailUnusable = channel === "email" && !hasVerifiedEmail;
                // Allow turning email off, but not on.
                const disabled = emailUnusable && !enabled;
                const showEmailWarning = emailUnusable && enabled;
                return (
                  <Table.Cell key={channel} className="px-4 py-4 align-top">
                    <div className="flex justify-center">
                      <div className="relative flex flex-col items-center">
                        <Slider
                          value={enabled}
                          onChange={(val) => onToggle(categoryInfo.category, channel, val)}
                          disabled={disabled}
                          ariaLabel={`${categoryInfo.label} ${CHANNEL_LABELS[channel]}`}
                        />
                        {/* Kept invisible (not unmounted) so the cell size stays stable. */}
                        {channel === "email" && (
                          <span
                            className={`flex mt-1 items-center justify-center gap-1 text-xs text-amber-400 whitespace-nowrap ${
                              showEmailWarning ? "" : "invisible"
                            }`}
                            title={
                              showEmailWarning
                                ? "You won't receive these emails until you add and verify an email address."
                                : undefined
                            }
                            aria-hidden={!showEmailWarning}
                          >
                            <FontAwesomeIcon icon={faExclamationTriangle} aria-hidden="true" />
                            Needs verified email
                          </span>
                        )}
                      </div>
                    </div>
                  </Table.Cell>
                );
              })}
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}

// ─── Mobile card layout ─────────────────────────────────────────────────────────

function PreferenceCard({
  categoryInfo,
  preference,
  hasVerifiedEmail,
  onToggle,
}: {
  categoryInfo: CategoryDisplayInfo;
  preference: LocalNotificationPreference;
  hasVerifiedEmail: boolean;
  onToggle: (category: string, channel: NotificationChannel, value: boolean) => void;
}) {
  const headingId = useId();
  return (
    <div className="bg-gray-900/50 rounded-lg p-4" role="group" aria-labelledby={headingId}>
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <h3 id={headingId} className="text-sm font-medium text-white">
            {categoryInfo.label}
          </h3>
          <TierBadge minTier={categoryInfo.minTier} />
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{categoryInfo.description}</p>
      </div>
      <div className="space-y-3">
        {CHANNEL_ORDER.map((channel) => {
          const enabled = preference.channels[channel];
          const emailUnusable = channel === "email" && !hasVerifiedEmail;
          // Allow turning email off, but not on.
          const disabled = emailUnusable && !enabled;
          const showEmailWarning = emailUnusable && enabled;
          return (
            <div key={channel} className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-300">{CHANNEL_LABELS[channel]}</span>
                {showEmailWarning && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <FontAwesomeIcon icon={faExclamationTriangle} aria-hidden="true" />
                    Needs verified email
                  </span>
                )}
              </div>
              <Slider
                value={enabled}
                onChange={(val) => onToggle(categoryInfo.category, channel, val)}
                disabled={disabled}
                ariaLabel={`${categoryInfo.label} ${CHANNEL_LABELS[channel]}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
