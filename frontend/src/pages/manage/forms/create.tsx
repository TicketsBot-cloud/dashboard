import { useEffect, useRef, useState, type FC } from "react";
import { apiClient, SKIP_ERROR_TOAST } from "@/lib/api";
import { useNavigate, useParams } from "react-router";
import { getGuildById } from "@/stores/auth";
import { toast } from "sonner";
import { MainLayout } from "@/pages/layout/Main";
import { useGuildStore } from "@/stores/guild";
import Button from "@/components/Button";
import TextInput from "@/components/TextInput";
import FeatureLockBanner from "@/components/FeatureLockBanner";
import { useFeatureLock } from "@/hooks/useFeatureLock";
import { FEATURE_FORMS } from "@/lib/feature-flags";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";

const CreateFormPage: FC = () => {
  const navigate = useNavigate();
  let { guildId } = useParams();
  guildId = guildId!;

  const { selectGuild, selectedGuild } = useGuildStore();
  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { locked: polledLock } = useFeatureLock(FEATURE_FORMS, guildId);
  const [forcedLock, setForcedLock] = useState(false);
  const isLocked = forcedLock || polledLock === true;

  // Announce the lock lifting mid-session (e.g. a flag re-enabled while this page
  // is open). The banner's own aria-live region only reliably announces the
  // unlocked-to-locked transition (see FeatureLockBanner), so the reverse gets a
  // toast instead. Guarded so it never fires on mount, only on a genuine flip.
  const previousLockRef = useRef(isLocked);
  useEffect(() => {
    if (previousLockRef.current && !isLocked) {
      toast.success("Form changes are available again.");
    }
    previousLockRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    const guild = getGuildById(guildId);
    if (guild) {
      if (!selectedGuild || selectedGuild.id !== guild.id) {
        selectGuild(guild);
      }

      if (guild.permission_level < 2) {
        toast.warning(
          "You do not have permission to manage this server's forms. Please contact an administrator.",
        );
      }
    }
  }, [guildId, selectGuild, selectedGuild]);

  const handleCreateForm = async (e: React.SubmitEvent) => {
    e.preventDefault();

    if (isLocked) return;

    if (!newTitle.trim()) {
      toast.error("Please enter a form title");
      return;
    }

    setIsCreating(true);

    try {
      const response = await apiClient.forms.create(guildId, { title: newTitle }, SKIP_ERROR_TOAST);

      if (response.data) {
        toast.success(`Form "${newTitle}" has been created`);
        navigate(`/manage/${guildId}/forms/edit/${response.data.form_id}`);
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      if (status === 503) {
        toast.warning(
          apiError ?? "Form management is temporarily unavailable. Please try again shortly.",
        );
        setForcedLock(true);
      } else {
        // SKIP_ERROR_TOAST opts out of the interceptor's toast for every
        // status, not just 503, so every other failure needs its own here.
        toast.error(apiError ?? "Failed to create form. Please try again.");
      }
      console.error("Failed to create form:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <MainLayout title="Create New Form" subtitle="Create a form to collect information from users">
      <FeatureLockBanner
        id="form-lock-banner"
        locked={isLocked}
        featureLabel="Form changes"
        existingLabel="forms"
      />
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="p-4">
          <h2 className="text-2xl font-bold mb-4">Create New Form</h2>

          <form onSubmit={handleCreateForm} className="flex gap-3">
            <div className="flex-1">
              <TextInput
                label=""
                placeholder="Form Title"
                value={newTitle}
                onChange={setNewTitle}
              />
            </div>
            <Button
              type="submit"
              variant="success"
              disabled={isCreating || !newTitle.trim()}
              visuallyDisabled={isLocked}
              aria-describedby={isLocked ? "form-lock-banner" : undefined}
            >
              <FontAwesomeIcon icon={faPaperPlane} className="mr-2" />
              Create
            </Button>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default CreateFormPage;
